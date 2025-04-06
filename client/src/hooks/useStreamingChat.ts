import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";

export const useStreamingChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [streamingComplete, setStreamingComplete] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedModel } = useModelSelection();
  
  // Reference to the currently streaming message
  const streamingMessageRef = useRef<{
    id: number;
    content: string;
  } | null>(null);
  
  // Reference to the EventSource for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);

  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Load messages for a conversation
  const loadConversation = useCallback(async (conversationId: number) => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Conversation not found
          setLocation("/");
          return;
        }
        throw new Error("Failed to load messages");
      }
      
      const data = await response.json();
      setMessages(data);
      setActiveConversationId(conversationId);
    } catch (error) {
      console.error("Error loading messages:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load conversation",
      });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [setLocation, toast]);

  // Send a message (with streaming for reasoning model)
  const sendMessage = useCallback(async (conversationId: number, content: string, image?: string) => {
    // If not the active conversation, load it first
    if (activeConversationId !== conversationId) {
      setActiveConversationId(conversationId);
      setLocation(`/chat/${conversationId}`);
    }

    setIsLoadingResponse(true);
    
    // Check if content accidentally contains stringified JSON data (from previous bug)
    // This could happen from previously stored messages in this format
    let messageContent = content;
    try {
      // Try to parse the content as JSON
      const parsed = JSON.parse(content);
      // If it parses and has a content field, use that instead
      if (parsed && typeof parsed === 'object' && 'content' in parsed) {
        console.log('Found legacy JSON-stringified message content, extracting inner content');
        messageContent = parsed.content;
      }
    } catch (e) {
      // Not JSON, use the original content
      messageContent = content;
    }
    
    // Create a temporary user message to show immediately with cleaned content
    const tempUserMessage: Message = {
      id: Date.now(), // Temporary ID
      conversationId,
      role: "user",
      content: messageContent, // Use cleaned content
      image,
      citations: null,
      createdAt: new Date().toISOString(),
    };
    
    // Add the user message right away (optimistic UI)
    setMessages((prev) => [...prev, tempUserMessage]);
    
    try {
      // Close any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Always use streaming for all model types in all environments
      console.log(`Sending message with selectedModel: ${selectedModel}, has image: ${!!image}`);
      streamingMessageRef.current = null;
      
      // Create a new EventSource connection with a generous timeout
      // Note: Adding a timestamp to prevent caching issues that might affect streaming
      const timestamp = Date.now();
      const streamUrl = `/api/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}${image ? `&image=${encodeURIComponent(image)}` : ''}&modelType=${selectedModel}&_t=${timestamp}`;
      
      console.log("Starting streaming chat from:", streamUrl);
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle different event types
            switch (data.type) {
              case "initial":
                // Set up the streaming message reference
                streamingMessageRef.current = {
                  id: data.assistantMessageId,
                  content: ""
                };
                
                // Add an empty message that will be updated as chunks arrive
                setMessages((prev) => [...prev, {
                  id: data.assistantMessageId,
                  conversationId,
                  role: "assistant",
                  content: "",
                  citations: null,
                  createdAt: new Date().toISOString(),
                }]);
                break;
                
              case "chunk":
                // Update the streaming message reference
                if (streamingMessageRef.current && streamingMessageRef.current.id === data.id) {
                  streamingMessageRef.current.content += data.content;
                  
                  // Update the message in the state with the new content
                  // Use a direct state update approach for better performance during streaming
                  setMessages((prev) => {
                    // Make a shallow copy of the messages array
                    const newMessages = [...prev];
                    
                    // Find the message that needs to be updated
                    const index = newMessages.findIndex(msg => msg.id === data.id);
                    
                    if (index !== -1) {
                      // Update just that message
                      newMessages[index] = {
                        ...newMessages[index],
                        content: streamingMessageRef.current!.content
                      };
                    }
                    
                    return newMessages;
                  });
                }
                break;
                
              case "done":
                // Final update with the complete message
                setMessages((prev) => prev.map(msg => 
                  msg.id === data.assistantMessage.id ? data.assistantMessage : msg
                ));
                
                setStreamingComplete(true);
                
                setTimeout(() => {
                  setIsLoadingResponse(false);
                  setTimeout(() => setStreamingComplete(false), 100);
                }, 50);
                
                eventSource.close();
                eventSourceRef.current = null;
                streamingMessageRef.current = null;
                
                window.dispatchEvent(new CustomEvent('message-sent', {
                  detail: { conversationId }
                }));
                break;
                
              case "error":
                // Handle explicit error events from server
                console.error("Server streaming error:", data.message);
                toast({
                  variant: "destructive",
                  title: "Server Error",
                  description: data.message || "An error occurred with the streaming response.",
                });
                
                // Clean up
                setIsLoadingResponse(false);
                eventSource.close();
                eventSourceRef.current = null;
                
                // If we have a partial message, remove it and fall back to non-streaming
                if (streamingMessageRef.current) {
                  setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
                  streamingMessageRef.current = null;
                  
                  // Fall back to non-streaming request
                  fallbackToNonStreaming(conversationId, messageContent, image, content);
                }
                break;
                
              default:
                console.warn("Unknown event type:", data.type);
            }
          } catch (parseError) {
            console.error("Error parsing SSE message:", parseError, "Raw data:", event.data);
            
            // This is likely a JSON parsing error or malformed data
            toast({
              variant: "destructive",
              title: "Response Format Error",
              description: "Received invalid data from server. Falling back to standard mode.",
            });
            
            // Clean up and fall back
            eventSource.close();
            eventSourceRef.current = null;
            
            if (streamingMessageRef.current) {
              setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
              streamingMessageRef.current = null;
              fallbackToNonStreaming(conversationId, messageContent, image, content);
            }
          }
        };
        
        eventSource.onerror = (error) => {
          console.error("EventSource error:", error);
          
          // Check if this is a connection error or server error
          let errorDescription = "Streaming failed. Falling back to standard mode.";
          
          // Try to determine the reason for the error
          if (error instanceof Event) {
            const target = error.target as EventSource;
            if (target && target.readyState === EventSource.CLOSED) {
              errorDescription = "Connection closed unexpectedly. Trying standard mode.";
            } else if (target && target.readyState === EventSource.CONNECTING) {
              errorDescription = "Connection interrupted. Trying standard mode.";
            }
          }
          
          toast({
            variant: "destructive",
            title: "Connection Error",
            description: errorDescription,
          });
          
          // Clean up
          setIsLoadingResponse(false);
          eventSource.close();
          eventSourceRef.current = null;
          
          // If we have a partial message, remove it and fall back to non-streaming
          if (streamingMessageRef.current) {
            setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
            streamingMessageRef.current = null;
            
            // Fall back to non-streaming request
            fallbackToNonStreaming(conversationId, messageContent, image, content);
          }
        };
        
        // Return early as the event source will handle the rest
        return;
      
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message",
      });
      
      // Remove the optimistic message on error
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      // For non-streaming requests, we need to set loading to false here
      // (For streaming requests, this is done in the "done" event handler)
      if (eventSourceRef.current === null) {
        setIsLoadingResponse(false);
      }
    }
  }, [activeConversationId, selectedModel, setLocation, toast]);
  
  // Helper function to handle non-streaming requests
  const fallbackToNonStreaming = async (conversationId: number, content: string, image?: string, originalContent?: string) => {
    // originalContent is the raw content before potential JSON parsing
    const messageContent = content; // Clean content is passed in directly now
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          content,
          image,
          modelType: selectedModel
        }),
      });
      
      // Handle HTTP errors
      if (!response.ok) {
        let errorMessage = `Server error (${response.status})`;
        try {
          // Try to get a more specific error message from the response
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (parseError) {
          // If we can't parse the error, just use the status text
          errorMessage = `${response.statusText || 'Unknown error'} (${response.status})`;
        }
        
        // Throw with a detailed message
        throw new Error(errorMessage);
      }
      
      // Parse successful response
      const data = await response.json();
      
      // Validate response structure
      if (!data || !data.userMessage || !data.assistantMessage) {
        console.error("Invalid response format:", data);
        throw new Error("Server returned an invalid response format");
      }
      
      // Update messages with the response data
      setMessages((prev) => {
        // Find our temporary message and replace it, using either original or parsed content
        const userMsgIndex = prev.findIndex(msg => 
          msg.role === "user" && 
          (msg.content === content || 
           msg.content === messageContent || 
           (originalContent && msg.content === originalContent)) && 
          msg.conversationId === conversationId
        );
        
        if (userMsgIndex === -1) {
          // If we can't find it, just add both messages
          return [...prev, data.userMessage, data.assistantMessage];
        }
        
        // Replace the temporary user message and add the assistant message
        const newMessages = [...prev];
        newMessages[userMsgIndex] = data.userMessage;
        
        // Add the assistant message if it doesn't exist already
        if (!prev.some(msg => msg.id === data.assistantMessage.id)) {
          newMessages.push(data.assistantMessage);
        }
        
        return newMessages;
      });
      
      // Notify that a message was sent (for conversation title updates)
      window.dispatchEvent(new CustomEvent('message-sent', {
        detail: { conversationId }
      }));
    } catch (error) {
      console.error("Error in fallback request:", error);
      
      // Create a more helpful error message
      let errorMessage = "Failed to send message";
      
      if (error instanceof Error) {
        // Check for specific error patterns
        const errorText = error.message.toLowerCase();
        
        if (error.message.includes("Failed to fetch") || errorText.includes("network")) {
          errorMessage = "Network connection error. Please check your internet connection.";
        } else if (errorText.includes("timeout")) {
          errorMessage = "Request timed out. The server is taking too long to respond.";
        } else if (error.message.length > 0 && !error.message.includes("[object")) {
          // Use the error message if it's not just a generic object toString
          errorMessage = error.message;
        }
      }
      
      // Show toast with specific error message
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
      
      throw error; // Re-throw to be caught by the main try/catch
    }
  };

  // Start a new conversation
  const startNewConversation = useCallback(async () => {
    setMessages([]);
    setActiveConversationId(undefined);
    setLocation("/");
  }, [setLocation]);

  return {
    messages,
    isLoadingMessages,
    isLoadingResponse,
    streamingComplete,
    activeConversationId,
    loadConversation,
    sendMessage,
    startNewConversation,
  };
};