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
  const { selectedModel, customOpenRouterModelId } = useModelSelection();
  
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
      
      // Check if we're running in a deployed/production environment
      const isProduction = window.location.host.includes('.replit.app') || 
                          window.location.host.includes('.gloriamundo.com') ||
                          !window.location.host.includes('localhost');
      
      // Enable streaming for both OpenRouter and reasoning models
      // Always enable streaming for OpenRouter, and for reasoning models in development environments
      if (selectedModel === "openrouter" || (selectedModel === "reasoning" && !isProduction)) {
        // Set up streaming for this request
        streamingMessageRef.current = null;
        
        // Create a new EventSource connection
        // For OpenRouter models, include both modelType="openrouter" and the specific modelId
        const isOpenRouter = selectedModel === "openrouter";
        const modelType = isOpenRouter ? "openrouter" : selectedModel;
        const modelId = isOpenRouter && customOpenRouterModelId ? customOpenRouterModelId : "";
        
        // Construct the stream URL and log it for debugging
        const streamUrl = `/api/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}${image ? `&image=${encodeURIComponent(image)}` : ''}&modelType=${modelType}${modelId ? `&modelId=${encodeURIComponent(modelId)}` : ''}`;
        console.log('Setting up EventSource for streaming:', { 
          modelType,
          modelId,
          isOpenRouter,
          streamUrl
        });
        
        // Create the EventSource
        const eventSource = new EventSource(streamUrl);
        eventSourceRef.current = eventSource;
        
        // EventSource management - define message handlers
        console.log('DEBUG - Setting up EventSource handlers');
        
        eventSource.onopen = () => {
          console.log('DEBUG - EventSource connection opened');
        };
        
        eventSource.onmessage = (event) => {
          // Declare variables at the outer scope so they're accessible in catch block
          let data: any = null;
          let jsonString = "";
          
          try {
            // Get the raw data and log it
            const rawData = event.data;
            console.log('DEBUG - EventSource raw data received:', rawData);
            console.log('DEBUG - EventSource data type:', typeof rawData);
            
            // IMPORTANT: Explicitly check for and handle the 'data:' prefix
            // Even though EventSource is supposed to strip this, we're seeing errors indicating it's not always doing so
            if (typeof rawData === 'string') {
              jsonString = rawData;
              
              // More robust handling of the "data:" prefix in various formats
              if (rawData.startsWith("data:")) {
                console.log('DEBUG - Detected "data:" prefix');
                
                // Find the position after the "data:" prefix
                // This handles both "data:" and "data: " formats (with or without space)
                const colonPos = rawData.indexOf(':');
                if (colonPos >= 0) {
                  // Extract everything after the colon (and optional space)
                  const afterColon = rawData.substring(colonPos + 1);
                  jsonString = afterColon.trim();
                  console.log('DEBUG - Stripped "data:" prefix, result:', jsonString);
                }
              }
              
              // Special case for [DONE] marker
              if (jsonString === '[DONE]') {
                console.log('DEBUG - Stream complete with [DONE] marker');
                return;
              }
              
              // Log the cleaned string we're about to parse
              console.log('DEBUG - Attempting to parse JSON string:', jsonString);
            } else {
              console.error('DEBUG - Expected string data but received:', typeof rawData);
              throw new Error(`Unexpected data type: ${typeof rawData}`);
            }
            
            // Parse the JSON data with extra error handling and recovery
            try {
              // First attempt - standard JSON parsing
              data = JSON.parse(jsonString);
              console.log('DEBUG - Successfully parsed JSON:', data);
            } catch (jsonError) {
              console.error('DEBUG - First JSON parse error:', jsonError);
              console.error('DEBUG - Failed to parse string:', jsonString);
              
              // If the first parse fails, let's try multiple recovery options
              try {
                // Option 1: Try to sanitize the string by removing any unexpected characters at the beginning
                let sanitizedString = jsonString;
                
                // Look for the first '{' character which should be the start of valid JSON
                const firstBraceIndex = jsonString.indexOf('{');
                if (firstBraceIndex > 0) {
                  sanitizedString = jsonString.substring(firstBraceIndex);
                  console.log('DEBUG - Found JSON object starting at position', firstBraceIndex);
                  console.log('DEBUG - Sanitized string:', sanitizedString);
                  
                  // Try parsing the sanitized string
                  data = JSON.parse(sanitizedString);
                  console.log('DEBUG - Successfully parsed sanitized JSON:', data);
                } else {
                  // Option 2: If the string starts with '{' but might have trailing content
                  const lastBraceIndex = jsonString.lastIndexOf('}');
                  if (lastBraceIndex > 0 && lastBraceIndex < jsonString.length - 1) {
                    sanitizedString = jsonString.substring(0, lastBraceIndex + 1);
                    console.log('DEBUG - Found truncated JSON ending at position', lastBraceIndex);
                    console.log('DEBUG - Sanitized string:', sanitizedString);
                    
                    // Try parsing the trimmed string
                    data = JSON.parse(sanitizedString);
                    console.log('DEBUG - Successfully parsed truncated JSON:', data);
                  } else {
                    // Option 3: For extreme cases, try to dynamically find valid JSON structure
                    // This is a more aggressive recovery option but may help in certain cases
                    try {
                      // Use regex to find pattern that looks like a JSON object
                      const jsonPattern = /{[^]*?}/;
                      const matched = jsonString.match(jsonPattern);
                      if (matched && matched[0]) {
                        console.log('DEBUG - Extracted potential JSON using regex');
                        data = JSON.parse(matched[0]);
                        console.log('DEBUG - Successfully parsed regex-extracted JSON:', data);
                      } else {
                        throw new Error('No valid JSON pattern found');
                      }
                    } catch (regexError) {
                      // Rethrow to be caught by outer recovery catch
                      throw regexError;
                    }
                  }
                }
              } catch (recoveryError) {
                // If all recovery attempts fail, log and re-throw the original error
                console.error('DEBUG - All JSON parse recovery attempts failed');
                console.error('DEBUG - Recovery error:', recoveryError);
                console.error('DEBUG - Original raw data was:', rawData);
                throw jsonError; // Re-throw the original error to be caught by the outer try/catch
              }
            }
            
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
                // Log every chunk for debugging
                console.log(`[${new Date().toISOString()}] Received chunk:`, {
                  id: data.id,
                  content: data.content,
                  contentLength: data.content.length
                });
                
                // Update the streaming message reference
                if (streamingMessageRef.current && streamingMessageRef.current.id === data.id) {
                  // Add new content to our running total
                  streamingMessageRef.current.content += data.content;
                  
                  // Important: Use a local variable to capture the full current content
                  // This prevents race conditions with setState being asynchronous
                  const updatedContent = streamingMessageRef.current.content;
                  
                  // Update the message in the state with the new content
                  // Use a function form of setState to ensure we always have latest state
                  setMessages((prev) => {
                    return prev.map(msg => 
                      msg.id === data.id 
                        ? { ...msg, content: updatedContent } 
                        : msg
                    );
                  });
                  
                  // Immediately force a UI update by setting streaming complete 
                  // and then resetting it after a short delay
                  setStreamingComplete(true);
                  setTimeout(() => setStreamingComplete(false), 10);
                } else {
                  console.warn("Received chunk for unknown message ID:", data.id);
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
            // Log the error with detailed information for debugging
            console.error("Error parsing SSE message:", parseError);
            console.error("Raw data:", event.data);
            
            // Provide a more specific error message based on the error type
            let errorDescription = "Received invalid data from server. Falling back to standard mode.";
            
            if (parseError instanceof Error) {
              if (parseError.message.includes("Unexpected token")) {
                // JSON syntax error - provide more specific information
                errorDescription = "Response format error: Invalid JSON structure. Falling back to standard mode.";
                console.error("JSON syntax error detected - likely the 'data:' prefix wasn't handled correctly");
                
                // Let's log the first 20-30 chars of the data to debug prefix issues
                if (typeof event.data === 'string') {
                  const dataStart = event.data.substring(0, 30);
                  console.error(`Data starts with: "${dataStart}..."`);
                }
              } else if (parseError.message.includes("is not defined")) {
                errorDescription = "Response processing error: Missing expected data. Falling back to standard mode.";
              }
            }
            
            // Show toast with informative error
            toast({
              variant: "destructive",
              title: "Response Format Error",
              description: errorDescription,
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
      }
      
      // For non-streaming approach (non-OpenRouter models in production or other model types), use regular fetch
      await fallbackToNonStreaming(conversationId, messageContent, image, content);
      
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
      if ((selectedModel !== "reasoning" && selectedModel !== "openrouter") || eventSourceRef.current === null) {
        setIsLoadingResponse(false);
      }
    }
  }, [activeConversationId, selectedModel, customOpenRouterModelId, setLocation, toast]);
  
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
          modelType: selectedModel,
          // Include the modelId for OpenRouter
          ...(selectedModel === "openrouter" && customOpenRouterModelId ? { modelId: customOpenRouterModelId } : {})
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