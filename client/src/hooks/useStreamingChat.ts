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
    
    // Create a temporary user message to show immediately
    const tempUserMessage: Message = {
      id: Date.now(), // Temporary ID
      conversationId,
      role: "user",
      content,
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
      
      // Check if we're running in a deployed/production environment
      const isProduction = window.location.host.includes('.replit.app') || 
                          window.location.host.includes('.gloriamundo.com') ||
                          !window.location.host.includes('localhost');
      
      // In production environments or with non-reasoning models, don't use streaming
      // This avoids streaming issues in deployed environments
      if (selectedModel === "reasoning" && !isProduction) {
        // We're using streaming in a development environment
        streamingMessageRef.current = null;
        
        // Create a new EventSource connection
        const eventSource = new EventSource(`/api/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}${image ? `&image=${encodeURIComponent(image)}` : ''}&modelType=${selectedModel}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
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
                setMessages((prev) => prev.map(msg => 
                  msg.id === data.id 
                    ? { ...msg, content: streamingMessageRef.current!.content } 
                    : msg
                ));
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
              
            default:
              console.warn("Unknown event type:", data.type);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error("EventSource error:", error);
          toast({
            variant: "destructive",
            title: "Connection Error",
            description: "Streaming failed. Falling back to standard mode.",
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
            fallbackToNonStreaming(conversationId, content, image);
          }
        };
        
        // Return early as the event source will handle the rest
        return;
      }
      
      // For non-streaming approach (production or non-reasoning models), use regular fetch
      await fallbackToNonStreaming(conversationId, content, image);
      
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
      if (selectedModel !== "reasoning" || eventSourceRef.current === null) {
        setIsLoadingResponse(false);
      }
    }
  }, [activeConversationId, selectedModel, setLocation, toast]);
  
  // Helper function to handle non-streaming requests
  const fallbackToNonStreaming = async (conversationId: number, content: string, image?: string) => {
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
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update messages with the response data
      setMessages((prev) => {
        // Find our temporary message and replace it
        const userMsgIndex = prev.findIndex(msg => 
          msg.role === "user" && msg.content === content && msg.conversationId === conversationId
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