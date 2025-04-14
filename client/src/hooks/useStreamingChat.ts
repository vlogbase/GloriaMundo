import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";
import { refreshSkimlinks } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// Helper function to determine if a model is vision-capable based on its name/ID
const isVisionCapableModel = (modelName: string, hasImage: boolean): boolean => {
  return !!hasImage || 
         modelName.includes('vision') || 
         modelName.includes('4o') || 
         modelName.includes('claude-3');
};

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

  // Function to get document context for RAG
  const getDocumentContext = useCallback(async (conversationId: number, query: string): Promise<string | null> => {
    if (!conversationId || !query) {
      return null;
    }
    
    try {
      // Encode query to safely include in URL
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`/api/conversations/${conversationId}/rag?query=${encodedQuery}`);
      
      if (!response.ok) {
        console.warn(`RAG retrieval returned status ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data && data.context) {
        return data.context;
      }
      
      return null;
    } catch (error) {
      console.error("Error retrieving document context:", error);
      return null;
    }
  }, []);

  // Helper function to handle non-streaming requests
  const fallbackToNonStreaming = useCallback(async (
    conversationId: number, 
    content: string, 
    image?: string, 
    originalContent?: string
  ) => {
    // originalContent is the raw content before potential JSON parsing
    const messageContent = content; // Clean content is passed in directly now
    try {
      // Try to get document context for this query (non-image messages only)
      let documentContext = null;
      if (!image) {
        try {
          documentContext = await getDocumentContext(conversationId, messageContent);
          console.log('[useStreamingChat] Document context for query:', documentContext ? 'Found' : 'None');
        } catch (contextError) {
          console.error('[useStreamingChat] Error getting document context:', contextError);
          // Continue without document context if there's an error
        }
      }
      
      // Determine which OpenRouter model to use
      const isVisionCapable = isVisionCapableModel(selectedModel, !!image);
      const modelId = customOpenRouterModelId || 
                   (isVisionCapable ? 'openai/gpt-4o' : 'openai/o3-mini');
      console.log(`[useStreamingChat] Using OpenRouter model: ${modelId}`);
      
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          content,
          image,
          modelType: "openrouter", // Always use OpenRouter
          modelId: modelId, // Always specify a model ID
          documentContext // Include context for RAG if available
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
  }, [getDocumentContext, customOpenRouterModelId, selectedModel, toast]);

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
        // We're using streaming in a development environment
        streamingMessageRef.current = null;
        
        // Create a new EventSource connection with proper URL parameters
        // Create a URLSearchParams object for proper parameter encoding
        const params = new URLSearchParams();
        params.append('content', content);
        params.append('modelType', 'openrouter'); // Always use OpenRouter
        
        // Add optional parameters if they exist
        if (image) params.append('image', image);
        
        // Add modelId parameter if available (for OpenRouter models)
        // Determine which OpenRouter model to use
        const isVisionCapable = isVisionCapableModel(selectedModel, !!image);
        const modelId = customOpenRouterModelId || 
                      (isVisionCapable ? 'openai/gpt-4o' : 'openai/o3-mini');
        params.append('modelId', modelId);
        
        // Fetch document context for non-image messages
        if (!image) {
          try {
            const documentContext = await getDocumentContext(conversationId, content);
            if (documentContext) {
              params.append('documentContext', documentContext);
              console.log('[useStreamingChat] Added document context to streaming request');
            }
          } catch (contextError) {
            console.error('[useStreamingChat] Error getting document context:', contextError);
            // Continue without document context if there's an error
          }
        }
        
        // Create the EventSource with the properly encoded URL
        console.log("Creating EventSource for streaming with URL params:", params.toString());
        const streamUrl = `/api/conversations/${conversationId}/messages/stream?${params.toString()}`;
        console.log("Full streaming URL:", streamUrl);
        const eventSource = new EventSource(streamUrl);
        eventSourceRef.current = eventSource;
        
        // Add onopen handler
        eventSource.onopen = (event) => {
          console.log("EventSource connection opened successfully:", event);
        };
        
        eventSource.onmessage = (event) => {
          try {
            // Check for the standard end-of-stream signal from OpenRouter
            if (event.data === '[DONE]') {
              console.log("Stream [DONE] received.");

              // --- Finalization Logic ---
              // Retrieve the final accumulated content (if needed)
              const finalContent = streamingMessageRef.current?.content || '';
              const finalReasoning = streamingMessageRef.current?.reasoningData; // We'll handle this later
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
                   // Always use OpenRouter with specific model ID
                   modelId: modelId // Use the determined OpenRouter model ID
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
                console.log("Initialized streaming message with ID:", assistantMessageId);
            }
            // --- End Handle first chunk ---


            // --- Process content delta ---
            // Extract the actual text content from the standard OpenRouter format
            const deltaContent = parsedData.choices?.[0]?.delta?.content;

            if (deltaContent && streamingMessageRef.current && assistantMessageId === streamingMessageRef.current.id) {
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
            // Get the ID from the current streaming message
            const msgId = streamingMessageRef.current?.id;
            const delta = parsedData.choices?.[0]?.delta;
            let extractedReasoningChunk = null;

            // Check for standard reasoning/tool fields in the delta first
            if (delta?.tool_calls) {
                extractedReasoningChunk = { toolCalls: delta.tool_calls };
                console.log("Detected reasoning chunk (tool_calls):", extractedReasoningChunk);
            } else if (delta?.function_call) {
                extractedReasoningChunk = { functionCall: delta.function_call };
                console.log("Detected reasoning chunk (function_call):", extractedReasoningChunk);
            } else {
                // Fallback check: Check for reasoning field at the message level (outside delta)
                // Structure might be choices[0].message.reasoning or choices[0].reasoning
                const reasoningContent = parsedData.choices?.[0]?.message?.reasoning || parsedData.choices?.[0]?.reasoning;
                if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
                    extractedReasoningChunk = { thinking_process: reasoningContent }; // Store under a custom key
                    console.log("Detected reasoning chunk (string field):", reasoningContent);
                }
            }
            // TODO: Add checks for other potential fields like logprobs based on testing

            if (extractedReasoningChunk && streamingMessageRef.current && msgId === streamingMessageRef.current.id) {
                // --- Accumulate Reasoning Data ---
                // NOTE: Simple accumulation might not be sufficient for complex cases like
                // arguments arriving in multiple chunks. More sophisticated merging might be needed based on testing.
                const currentReasoning = streamingMessageRef.current.reasoningData || {};
                const updatedReasoning = { ...currentReasoning };

                // Accumulate simple 'thinking_process' string
                if (extractedReasoningChunk.thinking_process) {
                    updatedReasoning.thinking_process = (updatedReasoning.thinking_process || "") + extractedReasoningChunk.thinking_process;
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
                  msg.id === msgId
                    ? { ...msg, reasoningData: { ...(streamingMessageRef.current!.reasoningData) } } // Ensure new object ref for react update
                    : msg
                ));
            }
            // --- End Reasoning Data Handling ---

          } catch (parseError) {
            // Keep existing error handling logic here (or adapt as needed)
            console.error("Error parsing SSE message:", parseError, "Raw data:", event.data);
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
          console.error("EventSource error:", error);
          
          // Check if this is a connection error or server error
          let errorDescription = "Streaming failed. Falling back to standard mode.";
          let readyState = "unknown";
          
          // Try to determine the reason for the error
          if (error instanceof Event) {
            const target = error.target as EventSource;
            if (target) {
              readyState = target.readyState === 0 ? "CONNECTING" :
                          target.readyState === 1 ? "OPEN" :
                          target.readyState === 2 ? "CLOSED" : "UNKNOWN";
              
              console.log(`EventSource readyState: ${readyState} (${target.readyState})`);
              
              if (target.readyState === EventSource.CLOSED) {
                errorDescription = "Connection closed unexpectedly. Trying standard mode.";
              } else if (target.readyState === EventSource.CONNECTING) {
                errorDescription = "Connection interrupted. Trying standard mode.";
              }
            }
          }
          
          // Print more detailed debugging information
          console.log(`EventSource error details:
            - ReadyState: ${readyState}
            - URL: ${streamUrl}
            - User message content length: ${messageContent?.length || 0}
            - Has image: ${image ? 'Yes' : 'No'}
            - Has content: ${content ? 'Yes' : 'No'}
          `);
          
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
            console.log("Falling back to non-streaming mode due to EventSource error");
            fallbackToNonStreaming(conversationId, messageContent, image, content);
          }
        };
        
        // Return early as the event source will handle the rest
        return;
      }
      
      // For non-streaming approach (when images are present), use regular fetch via fallbackToNonStreaming
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
      // For non-streaming requests (!shouldAttemptStream) or failed streaming attempts, 
      // we need to set loading to false here (for successful streaming, it's done in the event handler)
      if (!shouldAttemptStream || eventSourceRef.current === null) {
        setIsLoadingResponse(false);
      }
    }
  }, [activeConversationId, selectedModel, customOpenRouterModelId, getDocumentContext, fallbackToNonStreaming, setLocation, toast]);

  const startNewConversation = useCallback(async () => {
    setMessages([]);
    setActiveConversationId(undefined);
    setLocation("/");
  }, [setLocation]);

  // Upload document for RAG
  const uploadDocument = useCallback(async (conversationId: number, file: File) => {
    if (!conversationId) {
      throw new Error("Conversation ID is required to upload a document");
    }
    
    const formData = new FormData();
    formData.append('document', file);
    
    try {
      const response = await fetch(`/api/conversations/${conversationId}/documents`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        // Handle different error cases more gracefully
        if (response.status === 404) {
          throw new Error("Conversation not found. Please create a new chat and try again.");
        }
        
        // Try to parse error JSON, but handle cases where it might fail
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to upload document");
        } catch (jsonError) {
          // If JSON parsing fails, use status text
          throw new Error(`Upload failed: ${response.statusText || response.status}`);
        }
      }
      
      try {
        return await response.json();
      } catch (jsonError) {
        console.error("Error parsing success response:", jsonError);
        // Return a default success object if JSON parsing fails
        return { success: true, message: "Document uploaded successfully" };
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      throw error;
    }
  }, []);
  
  // Upload document wrapper that creates a conversation if needed
  const handleDocumentUpload = useCallback(async (file: File) => {
    try {
      // If no active conversation, create one first
      if (!activeConversationId) {
        // Create a new conversation with document name as title
        const newConversation = await apiRequest(
          "POST", 
          "/api/conversations", 
          { title: `Document: ${file.name}` }
        );
        
        const data = await newConversation.json();
        
        // Set the new conversation as active
        setActiveConversationId(data.id);
        setLocation(`/chat/${data.id}`);
        
        // Upload document to the new conversation
        return await uploadDocument(data.id, file);
      }
      
      // If we already have an active conversation, use that
      return await uploadDocument(activeConversationId, file);
    } catch (error) {
      console.error("Error handling document upload:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload document",
      });
      throw error;
    }
  }, [activeConversationId, uploadDocument, setLocation, toast]);

  return {
    messages,
    isLoadingMessages,
    isLoadingResponse,
    streamingComplete,
    activeConversationId,
    loadConversation,
    sendMessage,
    startNewConversation,
    uploadDocument: handleDocumentUpload,
  };
};