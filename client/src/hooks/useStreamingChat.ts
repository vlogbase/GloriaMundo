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
    console.log('[STREAM DEBUG] Checking if should stream...', { shouldAttemptStream, image, selectedModel, customOpenRouterModelId });
    
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
        console.log('[STREAM DEBUG] >>> Attempting STREAMING path <<<');
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
          try {
            console.log('[STREAM DEBUG] eventSource.onmessage: Received event', { eventData: event.data });
            // Check for the standard end-of-stream signal from OpenRouter
            if (event.data === '[DONE]') {
              console.log("[STREAM DEBUG] Stream [DONE] received. Finalizing response.");

              // --- Finalization Logic ---
              // Retrieve the final accumulated content (if needed)
              const finalContent = streamingMessageRef.current?.content || '';
              const finalReasoning = streamingMessageRef.current?.reasoningData; // We'll handle this later
              
              // Log final state for debugging
              console.log("[STREAM DEBUG] Final content length:", finalContent.length);
              console.log("[STREAM DEBUG] Final reasoning data:", finalReasoning ? 
                          Object.keys(finalReasoning).map(key => `${key}: ${typeof finalReasoning[key]}`).join(', ') : 
                          "none");
              const assistantMsgId = streamingMessageRef.current?.id;

              // Optional: Make API call to save final content/reasoning if needed
              // Example: (ensure apiRequest function exists and handles PATCH)
              /*
              if (assistantMsgId) {
                apiRequest("PATCH", `/api/conversations/${conversationId}/messages/${assistantMsgId}`, {
                  content: finalContent,
                  // reasoningData: finalReasoning // Add later when reasoning is handled
                }).catch(error => {
                  console.error("Error saving final message content:", error);
                });
              }
              */

              // Update state to indicate loading/streaming finished
              setIsLoadingResponse(false); // Ensure this state setter exists
              setStreamingComplete(true); // Ensure this state setter exists
              setTimeout(() => setStreamingComplete(false), 100); // Reset UI indicator

              // Close the EventSource connection
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                console.log("EventSource closed.");
              }
              streamingMessageRef.current = null; // Clear the streaming message ref

              // Optional: Notify other parts of the app if needed
              // Ensure conversationId is accessible in this scope
              window.dispatchEvent(new CustomEvent('message-sent', {
                detail: { conversationId }
              }));

              return; // Stop processing this event
            }

            // If not '[DONE]', parse the JSON payload from OpenRouter
            console.log('[STREAM DEBUG] Parsing event data:', event.data.substring(0, 100) + (event.data.length > 100 ? '...' : ''));
            
            // Check if this is an error event from the server
            try {
              if (event.data.includes('"error":true') || event.data.includes('"type":"error"')) {
                const errorData = JSON.parse(event.data);
                console.error('[STREAM DEBUG] Received error event from server:', errorData);
                
                // Show the error to the user
                toast({
                  variant: "destructive",
                  title: "AI Model Error",
                  description: errorData.message || "An error occurred while generating the response"
                });
                
                // Cleanup and exit
                setIsLoadingResponse(false);
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                }
                
                // If we have a partial message, consider removing it
                if (streamingMessageRef.current) {
                  if (errorData.status >= 400 && errorData.status !== 429) {
                    // Only remove for permanent errors, not rate limiting
                    setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
                  }
                  streamingMessageRef.current = null;
                }
                
                return; // Stop processing this event
              }
            } catch (errorCheckError) {
              // If we can't parse it as an error, continue normal processing
              console.log('[STREAM DEBUG] Error check failed, continuing with normal processing:', errorCheckError);
            }
            
            const parsedData = JSON.parse(event.data);

            // --- Handle first chunk ---
            let assistantMessageId = streamingMessageRef.current?.id;
            if (!assistantMessageId && parsedData.id) {
                // This seems to be the first chunk containing an ID for the assistant message
                const newMessagePlaceholder: Message = { // Ensure Message type is imported/correct
                   id: parsedData.id, // Use ID from stream
                   conversationId: conversationId, // Ensure conversationId is accessible
                   role: "assistant",
                   content: "", // Start empty
                   citations: null,
                   createdAt: new Date().toISOString(),
                   // Ensure modelId is set if needed/available, e.g., from selectedModel
                   modelId: selectedModel || undefined // Ensure selectedModel is accessible here
                };
                // Add the placeholder to the messages state
                setMessages((prev) => [...prev, newMessagePlaceholder]);
                // Initialize the ref to track this message
                streamingMessageRef.current = {
                   id: newMessagePlaceholder.id,
                   content: "",
                   reasoningData: {}
                };
                assistantMessageId = newMessagePlaceholder.id;
                console.log("[STREAM DEBUG] Initialized streaming message with ID:", assistantMessageId);
            }
            // --- End Handle first chunk ---


            // --- Process content delta ---
            // Extract the actual text content from the standard OpenRouter format
            const deltaContent = parsedData.choices?.[0]?.delta?.content;

            if (deltaContent && streamingMessageRef.current && assistantMessageId === streamingMessageRef.current.id) {
              // Log every 10th content chunk to avoid flooding the console
              const currentLength = streamingMessageRef.current.content.length;
              if (currentLength % 100 === 0 || currentLength < 20) {
                console.log(`[STREAM DEBUG] Content chunk received at position ${currentLength}, chunk length: ${deltaContent.length}`);
              }
              
              // Append the content chunk to our tracked content
              streamingMessageRef.current.content += deltaContent;

              // Update the corresponding message in the React state
              // Ensure setMessages is accessible here
              setMessages((prev) => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: streamingMessageRef.current!.content }
                  : msg
              ));
            }
            // --- End Process content delta ---


            // --- Reasoning Data Handling ---
            // We're reusing the assistantMessageId from the earlier scope (scope collision fix)
            // const assistantMessageId = streamingMessageRef.current?.id;
            const delta = parsedData.choices?.[0]?.delta;
            let extractedReasoningChunk = null;

            // Check for standard reasoning/tool fields in the delta first
            if (delta?.tool_calls) {
                extractedReasoningChunk = { toolCalls: delta.tool_calls };
                console.log("[STREAM DEBUG] Detected reasoning chunk (tool_calls):", extractedReasoningChunk);
            } else if (delta?.function_call) {
                extractedReasoningChunk = { functionCall: delta.function_call };
                console.log("[STREAM DEBUG] Detected reasoning chunk (function_call):", extractedReasoningChunk);
            } else {
                // Fallback check: Check for reasoning field at the message level (outside delta)
                // Structure might be choices[0].message.reasoning or choices[0].reasoning
                const reasoningContent = parsedData.choices?.[0]?.message?.reasoning || parsedData.choices?.[0]?.reasoning;
                if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
                    extractedReasoningChunk = { thinking_process: reasoningContent }; // Store under a custom key
                    console.log("[STREAM DEBUG] Detected reasoning chunk (string field):", reasoningContent);
                }
            }
            // TODO: Add checks for other potential fields like logprobs based on testing

            if (extractedReasoningChunk && streamingMessageRef.current && assistantMessageId === streamingMessageRef.current.id) {
                // --- Accumulate Reasoning Data ---
                // NOTE: Simple accumulation might not be sufficient for complex cases like
                // arguments arriving in multiple chunks. More sophisticated merging might be needed based on testing.
                const currentReasoning = streamingMessageRef.current.reasoningData || {};
                const updatedReasoning = { ...currentReasoning };

                // Accumulate simple 'thinking_process' string
                if (extractedReasoningChunk.thinking_process) {
                    console.log("[STREAM DEBUG] Accumulating thinking_process chunk:", {
                        existingLength: (updatedReasoning.thinking_process || "").length,
                        newChunkLength: extractedReasoningChunk.thinking_process.length
                    });
                    updatedReasoning.thinking_process = (updatedReasoning.thinking_process || "") + extractedReasoningChunk.thinking_process;
                    console.log("[STREAM DEBUG] Updated thinking_process total length:", updatedReasoning.thinking_process.length);
                }

                // Accumulate toolCalls (using previous intelligent merge logic)
                if (extractedReasoningChunk.toolCalls && Array.isArray(extractedReasoningChunk.toolCalls)) {
                    if (!updatedReasoning.toolCalls) updatedReasoning.toolCalls = [];
                     extractedReasoningChunk.toolCalls.forEach((newToolCall: any) => {
                       const existingCallIndex = newToolCall.index !== undefined ? updatedReasoning.toolCalls.findIndex((c: any) => c.index === newToolCall.index) : -1;
                       const existingCallIndexById = (existingCallIndex === -1 && newToolCall.id) ? updatedReasoning.toolCalls.findIndex((c: any) => c.id === newToolCall.id) : -1;
                       const finalIndex = existingCallIndex !== -1 ? existingCallIndex : existingCallIndexById;
                       if (finalIndex > -1) {
                         const existingCall = updatedReasoning.toolCalls[finalIndex];
                         const functionUpdate = { ...(existingCall.function || {}), ...(newToolCall.function || {}) };
                         if (newToolCall.function?.arguments && typeof existingCall.function?.arguments === 'string') {
                           functionUpdate.arguments = existingCall.function.arguments + newToolCall.function.arguments;
                         } else if (newToolCall.function?.arguments) {
                            functionUpdate.arguments = newToolCall.function.arguments;
                         }
                         updatedReasoning.toolCalls[finalIndex] = { ...existingCall, ...newToolCall, function: functionUpdate };
                       } else {
                         updatedReasoning.toolCalls.push(newToolCall);
                       }
                     });
                }
                // Accumulate functionCall (using previous intelligent merge logic)
                if (extractedReasoningChunk.functionCall) {
                     if (!updatedReasoning.functionCall) {
                         updatedReasoning.functionCall = extractedReasoningChunk.functionCall;
                     } else {
                         if (extractedReasoningChunk.functionCall.arguments &&
                             typeof extractedReasoningChunk.functionCall.arguments === 'string' &&
                             updatedReasoning.functionCall.arguments &&
                             typeof updatedReasoning.functionCall.arguments === 'string')
                         {
                             updatedReasoning.functionCall.arguments += extractedReasoningChunk.functionCall.arguments;
                         } else if (extractedReasoningChunk.functionCall.arguments) {
                            updatedReasoning.functionCall.arguments = extractedReasoningChunk.functionCall.arguments;
                         }
                         updatedReasoning.functionCall = {...updatedReasoning.functionCall, ...extractedReasoningChunk.functionCall};
                     }
                }
                // TODO: Add merging logic for other reasoning types here (e.g., logprobs)

                streamingMessageRef.current.reasoningData = updatedReasoning;
                // --- End Accumulate ---

                // Update message state with the new reasoning data
                // Ensure setMessages is accessible here
                setMessages((prev) => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, reasoningData: { ...(streamingMessageRef.current!.reasoningData) } } // Ensure new object ref for react update
                    : msg
                ));
            }
            // --- End Reasoning Data Handling ---

          } catch (parseError) {
            // Keep existing error handling logic here (or adapt as needed)
            console.error("[STREAM DEBUG] Error parsing SSE message:", parseError, "Raw data:", event.data);
            // Ensure toast function is accessible here
            toast({ variant: "destructive", title: "Response Format Error", description: "Received invalid data from server." });
            // Add fallback logic if needed
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            // Ensure setIsLoadingResponse is accessible here
            setIsLoadingResponse(false);
            // Maybe remove partial message if necessary
            if (streamingMessageRef.current) {
              setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageRef.current?.id));
              streamingMessageRef.current = null;
              fallbackToNonStreaming(conversationId, messageContent, image, content);
            }
          }
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