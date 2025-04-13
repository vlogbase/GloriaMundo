import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";
import { refreshSkimlinks } from "@/lib/utils";

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
    reasoningData?: Record<string, any>;
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

  // Send a message (with streaming for text messages, non-streaming for images)
  const sendMessage = useCallback(async (conversationId: number, content: string, image?: string) => {
    // If not the active conversation, load it first
    if (activeConversationId !== conversationId) {
      setActiveConversationId(conversationId);
      setLocation(`/chat/${conversationId}`);
    }

    // Determine if the request should attempt streaming (stream unless an image is present)
    const shouldAttemptStream = !image;
    const initialTimestamp = new Date().toISOString();
    console.log(`[STREAM DEBUG] [${initialTimestamp}] Checking if should stream...`, { shouldAttemptStream, image, selectedModel, customOpenRouterModelId });
    
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
      
      // If we should attempt streaming, set it up
      if (shouldAttemptStream) {
        const streamingPathTimestamp = new Date().toISOString();
        console.log(`[STREAM DEBUG] [${streamingPathTimestamp}] >>> Attempting STREAMING path <<<`);
        // We're using streaming in a development environment
        streamingMessageRef.current = null;
        
        // Create a new EventSource connection with proper URL parameters
        // Create a URLSearchParams object for proper parameter encoding
        const params = new URLSearchParams();
        params.append('content', content);
        params.append('modelType', selectedModel);
        
        // Add optional parameters if they exist
        if (image) params.append('image', image);
        
        // Add modelId parameter if available (for OpenRouter models)
        if (customOpenRouterModelId) params.append('modelId', customOpenRouterModelId);
        
        // Create the EventSource with the properly encoded URL
        const eventSource = new EventSource(`/api/conversations/${conversationId}/messages/stream?${params.toString()}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
          // --- Simplified onmessage Handler ---
          try {
            // Check for the standard end-of-stream signal
            if (event.data === '[DONE]') {
              console.log("[STREAM DEBUG] Simplified: Stream [DONE] received.");

              // Finalization Logic (minimal)
              const assistantMsgId = streamingMessageRef.current?.id;
              // TODO: Add back optional API call to save final content if needed

              // Ensure these state setters are accessible in this scope
              setIsLoadingResponse(false);
              setStreamingComplete(true);
              setTimeout(() => setStreamingComplete(false), 100);

              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                console.log("[STREAM DEBUG] Simplified: EventSource closed.");
              }
              streamingMessageRef.current = null;

              // Ensure conversationId is accessible in this scope
              window.dispatchEvent(new CustomEvent('message-sent', { detail: { conversationId } }));
              return; // Stop processing this event
            }

            // If not '[DONE]', parse the JSON payload
            const parsedData = JSON.parse(event.data);
            console.log("[STREAM DEBUG] Simplified: Received event data"); // Simplified log

            // --- Handle first chunk & initialize placeholder message ---
            // Ensure streamingMessageRef, parsedData.id, Message type, conversationId, selectedModel,
            // customOpenRouterModelId, setMessages, and tempUserMessage are accessible
            let assistantMessageId = streamingMessageRef.current?.id;
            if (!assistantMessageId && parsedData.id) {
                const newMessagePlaceholder: Message = {
                   id: parsedData.id,
                   conversationId: conversationId,
                   role: "assistant",
                   content: "",
                   citations: null,
                   reasoningData: {}, // Keep empty for now
                   createdAt: new Date().toISOString(),
                   modelId: customOpenRouterModelId || selectedModel || undefined
                };
                // Ensure setMessages and tempUserMessage are accessible
                // This logic assumes tempUserMessage might need to be replaced/handled correctly
                setMessages((prev) => [...prev.filter(m => m.id !== tempUserMessage.id), tempUserMessage, newMessagePlaceholder]);
                streamingMessageRef.current = {
                   id: newMessagePlaceholder.id,
                   content: "",
                   reasoningData: {}
                };
                assistantMessageId = newMessagePlaceholder.id;
                console.log("[STREAM DEBUG] Simplified: Initialized message placeholder:", assistantMessageId);
            }

            // --- Process content delta (Simplified) ---
            const deltaContent = parsedData.choices?.[0]?.delta?.content;

            if (deltaContent && streamingMessageRef.current && assistantMessageId === streamingMessageRef.current.id) {
              // Append the content chunk to ref
              streamingMessageRef.current.content += deltaContent;

              // Update the message state
              // Ensure setMessages is accessible
              setMessages((prev) => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: streamingMessageRef.current!.content }
                  : msg
              ));
            }
            // --- End Process content delta ---

            // --- Reasoning Handling REMOVED for simplification ---

          } catch (parseError) {
            // Ensure toast, eventSourceRef, setIsLoadingResponse, streamingMessageRef,
            // setMessages, fallbackToNonStreaming (if used) are accessible
            console.error("[STREAM DEBUG] Simplified: Error parsing SSE message:", parseError, "Raw data:", event.data);
            toast({ variant: "destructive", title: "Response Format Error", description: "Received invalid data from server." });
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            setIsLoadingResponse(false);
            if (streamingMessageRef.current) {
                // Remove potentially incomplete message
                setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
                streamingMessageRef.current = null;
                // fallbackToNonStreaming(...); // Consider if fallback is needed here
            }
          }
          // --- End Simplified onmessage Handler ---
        };
        
        eventSource.onerror = (error) => {
          const timestamp = new Date().toISOString();
          console.error(`[STREAM DEBUG] [${timestamp}] eventSource.onerror: Error event received`, { error });
          console.error(`[STREAM DEBUG] [${timestamp}] EventSource full error object:`, error);
          
          // Check if this is a connection error or server error
          let errorDescription = "Streaming failed. Falling back to standard mode.";
          let errorCategory = "connection";
          
          // Try to determine the reason for the error
          if (error instanceof Event) {
            const target = error.target as EventSource;
            if (target && target.readyState === EventSource.CLOSED) {
              errorDescription = "Connection closed unexpectedly. Trying standard mode.";
              errorCategory = "closed";
              console.log(`[STREAM DEBUG] [${timestamp}] Connection CLOSED unexpectedly`);
            } else if (target && target.readyState === EventSource.CONNECTING) {
              errorDescription = "Connection interrupted. Trying standard mode.";
              errorCategory = "interrupted";
              console.log(`[STREAM DEBUG] [${timestamp}] Connection INTERRUPTED`);
            }
          }
          
          // Log additional diagnostics
          console.log(`[STREAM DEBUG] [${timestamp}] Error diagnostics:`, {
            streamingMessageId: streamingMessageRef.current?.id,
            contentAccumulatedLength: streamingMessageRef.current?.content?.length || 0,
            hasReasoningData: !!streamingMessageRef.current?.reasoningData,
            errorCategory
          });
          
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
      
      // For non-streaming approach (when images are present), use regular fetch via fallbackToNonStreaming
      console.log('[STREAM DEBUG] >>> Taking NON-STREAMING fallback path <<<');
      await fallbackToNonStreaming(conversationId, messageContent, image, content);
      
    } catch (error) {
      const timestamp = new Date().toISOString();
      console.error(`[STREAM DEBUG] [${timestamp}] Error sending message:`, error);
      
      // Extract meaningful error information
      let errorMessage = "Failed to send message";
      let errorCategory = "unknown";
      
      if (error instanceof Error) {
        if (error.message.includes("network") || error.message.includes("fetch")) {
          errorCategory = "network";
          errorMessage = "Network error. Please check your connection.";
        } else if (error.message.includes("timeout")) {
          errorCategory = "timeout";
          errorMessage = "Request timed out. Server is taking too long to respond.";
        } else if (error.message.includes("model")) {
          errorCategory = "model";
          errorMessage = error.message;
        } else if (error.message.length > 0) {
          errorMessage = error.message;
        }
      }
      
      console.log(`[STREAM DEBUG] [${timestamp}] Categorized error:`, {
        category: errorCategory,
        message: errorMessage,
        originalError: error instanceof Error ? error.message : String(error)
      });
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
      
      // Remove the optimistic message on error
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      // For non-streaming requests (!shouldAttemptStream) or failed streaming attempts, 
      // we need to set loading to false here (for successful streaming, it's done in the event handler)
      if (!shouldAttemptStream || eventSourceRef.current === null) {
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
          modelId: customOpenRouterModelId || undefined
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
      const timestamp = new Date().toISOString();
      console.error(`[STREAM DEBUG] [${timestamp}] Error in fallback request:`, error);
      
      // Create a more helpful error message
      let errorMessage = "Failed to send message";
      let errorCategory = "unknown";
      
      if (error instanceof Error) {
        // Check for specific error patterns
        const errorText = error.message.toLowerCase();
        
        if (error.message.includes("Failed to fetch") || errorText.includes("network")) {
          errorCategory = "network";
          errorMessage = "Network connection error. Please check your internet connection.";
        } else if (errorText.includes("timeout")) {
          errorCategory = "timeout";
          errorMessage = "Request timed out. The server is taking too long to respond.";
        } else if (errorText.includes("insufficient credits")) {
          errorCategory = "credits";
          errorMessage = "Insufficient credits. Please purchase more credits to continue.";
        } else if (errorText.includes("model") && errorText.includes("not found")) {
          errorCategory = "model_not_found";
          errorMessage = "The selected AI model is not available. Please try a different model.";
        } else if (errorText.includes("context length") || errorText.includes("token limit")) {
          errorCategory = "context_length";
          errorMessage = "Your message is too long for this model's context window. Please try a shorter message or a different model.";
        } else if (error.message.length > 0 && !error.message.includes("[object")) {
          // Use the error message if it's not just a generic object toString
          errorMessage = error.message;
        }
      }
      
      console.log(`[STREAM DEBUG] [${timestamp}] Categorized fallback error:`, {
        category: errorCategory,
        message: errorMessage,
        originalError: error instanceof Error ? error.message : String(error)
      });
      
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