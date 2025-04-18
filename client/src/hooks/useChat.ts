import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Message, ModelType } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";
import { refreshSkimlinks } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";

export const useChat = () => {
  // Removed excessive debug logging
  // console.log('[useChat] Hook initializing...');
  
  // Initialize with an empty array for messages
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
  
  // Track hook initialization count to prevent unnecessary re-renders
  const initCountRef = useRef(0);
  useEffect(() => {
    // Only log on first initialization and not on re-renders
    if (initCountRef.current === 0) {
      // console.log('[useChat] Hook initialized (first time)');
    }
    initCountRef.current++;
  }, []);
  
  // Clean up event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);
  
  // For debugging the first message issue
  const isFirstMessageSentRef = useRef(false);

  // Load messages for a conversation
  const loadConversation = useCallback(async (conversationId: number) => {
    setIsLoadingMessages(true);
    console.log(`[useChat] Loading conversation ${conversationId}`);
    
    try {
      // First set the active conversation ID to ensure it's updated before fetching messages
      // This order is important for proper state management
      setActiveConversationId(conversationId);
      
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Conversation not found
          console.log(`[useChat] Conversation ${conversationId} not found`);
          setLocation("/");
          return;
        }
        throw new Error("Failed to load messages");
      }
      
      const data = await response.json();
      console.log(`[useChat] Loaded ${data.length} messages for conversation ${conversationId}`);
      
      // Check and log if we have user's first message in the data
      const userMessages = data.filter((msg: Message) => msg.role === 'user');
      if (userMessages.length > 0) {
        console.log(`[useChat] First user message in loaded data:`, userMessages[0]);
      } else {
        console.log(`[useChat] No user messages found in loaded data`);
      }
      
      // Set the messages using functional update to ensure we have the latest state
      setMessages(data);
      
      // Check if there are any AI responses in the loaded conversation
      if (data.some((message: Message) => message.role === 'assistant')) {
        // Wait for the DOM to update with the loaded messages before refreshing Skimlinks
        setTimeout(() => {
          refreshSkimlinks();
        }, 1000);
      }
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

  // Get relevant document context for a query
  const getDocumentContext = useCallback(async (conversationId: number, query: string) => {
    if (!conversationId) return null;
    
    try {
      console.log(`[useChat] Getting document context for query in conversation ${conversationId}`);
      const response = await fetch(`/api/conversations/${conversationId}/rag?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        console.warn(`[useChat] Failed to get document context: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      console.log(`[useChat] Document context retrieved:`, data);
      
      if (data.hasContext) {
        return data.context;
      }
      
      return null;
    } catch (error) {
      console.error('[useChat] Error getting document context:', error);
      return null;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(async (conversationId: number, content: string, image?: string) => {
    // Log whether this is the first message ever (debugging first message bug)
    const isFirstEver = !isFirstMessageSentRef.current;
    console.log(`[useChat] sendMessage called: isFirstEver=${isFirstEver}, conversationId=${conversationId}`);
    console.log('[useChat] Current messages state:', messages);
    
    // If not the active conversation, load it first
    if (activeConversationId !== conversationId) {
      console.log(`[useChat] Changing active conversation from ${activeConversationId} to ${conversationId}`);
      setActiveConversationId(conversationId);
      setLocation(`/chat/${conversationId}`);
    }

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
    
    // Optimistically add user message with the cleaned content
    const tempUserMessage: Message = {
      id: Date.now(),
      conversationId,
      role: "user",
      content: messageContent, // Use cleaned content
      image,
      createdAt: new Date().toISOString(),
      citations: null,
    };
    
    // Ensure user message is always added to the messages array
    console.log('[useChat] BEFORE adding user message. Current messages:', messages);
    setMessages((prev) => {
      const updatedMessages = [...prev, tempUserMessage];
      console.log('[useChat] Adding user message. State changing from', prev, 'to', updatedMessages);
      return updatedMessages;
    });
    
    // Mark that we've sent the first message (for debugging tracking)
    if (!isFirstMessageSentRef.current) {
      console.log('[useChat] This is the first message ever sent in this session');
      isFirstMessageSentRef.current = true;
    }
    
    setIsLoadingResponse(true);

    try {
      // Log request details for debugging
      console.log(`Sending message to conversation ${conversationId} with model: ${selectedModel}`);
      console.log(`Current customOpenRouterModelId: ${customOpenRouterModelId}`);
      
      // Prepare model metadata
      let modelMetadata = {};
      
      // We always use OpenRouter now, just need to determine which model ID to use
      if (customOpenRouterModelId) {
        console.log(`Using specific OpenRouter model: ${customOpenRouterModelId}`);
        // Always pass the modelId parameter explicitly in the expected format
        modelMetadata = { modelId: customOpenRouterModelId };
      } else {
        // Safety catch - if we don't have a specific model ID, use the default
        console.log("No specific model ID provided, using default free model as fallback");
        modelMetadata = { modelId: "openai/o3-mini" }; // Using a reliable free model
      }
      
      // Try to get document context for this query
      let documentContext = null;
      try {
        // Only attempt to get document context for non-image queries
        if (!image) {
          documentContext = await getDocumentContext(conversationId, messageContent);
          console.log('[useChat] Document context for query:', documentContext ? 'Found' : 'None');
        }
      } catch (contextError) {
        console.error('[useChat] Error getting document context:', contextError);
        // Continue without document context if there's an error
      }
      
      // Determine if we should use streaming (don't stream for image inputs)
      const shouldAttemptStream = !image;
      
      // Close any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (shouldAttemptStream) {
        console.log('[useChat] Using streaming API for this message');
        // Reset streaming message reference
        streamingMessageRef.current = null;
        
        // Create a URLSearchParams object for proper parameter encoding
        const params = new URLSearchParams();
        params.append('content', messageContent);
        params.append('modelType', selectedModel);
        
        // Add optional parameters if they exist
        if (documentContext) params.append('documentContext', documentContext);
        
        // Add modelId parameter if available (for OpenRouter models)
        if ('modelId' in modelMetadata) params.append('modelId', modelMetadata.modelId as string);
        
        // Create the EventSource with the properly encoded URL
        const eventSource = new EventSource(`/api/conversations/${conversationId}/messages/stream?${params.toString()}`);
        eventSourceRef.current = eventSource;
        
        eventSource.onmessage = (event) => {
          try {
            // Check for the standard end-of-stream signal from OpenRouter
            if (event.data === '[DONE]') {
              console.log("Stream [DONE] received.");
              
              // Update state to indicate loading/streaming finished
              setIsLoadingResponse(false);
              setStreamingComplete(true);
              setTimeout(() => setStreamingComplete(false), 100);
              
              // Close the EventSource connection
              if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                console.log("EventSource closed.");
              }
              streamingMessageRef.current = null; // Clear the streaming message ref
              
              // Notify other parts of the app if needed
              window.dispatchEvent(new CustomEvent('message-sent', {
                detail: { conversationId }
              }));
              
              // Refresh links
              setTimeout(() => {
                refreshSkimlinks();
              }, 1000);
              
              return; // Stop processing this event
            }
            
            // If not '[DONE]', parse the JSON payload
            const parsedData = JSON.parse(event.data);
            
            // Handle first chunk with message ID
            let assistantMessageId = streamingMessageRef.current?.id;
            if (!assistantMessageId && parsedData.id) {
              // This is the first chunk containing an ID for the assistant message
              const newMessagePlaceholder: Message = {
                id: parsedData.id,
                conversationId: conversationId,
                role: "assistant",
                content: "", // Start empty
                citations: null,
                createdAt: new Date().toISOString(),
                modelId: selectedModel || undefined
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
            
            // Process content delta
            const deltaContent = parsedData.choices?.[0]?.delta?.content;
            
            if (deltaContent && streamingMessageRef.current) {
              // Append the content chunk to our tracked content
              streamingMessageRef.current.content += deltaContent;
              
              // Update the corresponding message in the React state
              setMessages((prev) => prev.map(msg =>
                msg.id === streamingMessageRef.current!.id
                  ? { ...msg, content: streamingMessageRef.current!.content }
                  : msg
              ));
            }
            
          } catch (error) {
            console.error("Error processing stream event:", error);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error("EventSource error:", error);
          // Close the connection on error
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          setIsLoadingResponse(false);
          
          toast({
            variant: "destructive",
            title: "Streaming Error",
            description: "Failed to stream the AI response. Please try again.",
          });
        };
        
        // Return early since we're handling the response via streaming
        return;
      }
      
      // If we're not streaming (e.g., for image inputs), use the regular API
      console.log('[useChat] Using regular API for this message (no streaming)');
      
      // Define the proper type for our payload
      interface MessagePayload {
        content: string;
        image?: string;
        modelType: ModelType | 'openrouter';
        modelId?: string;
        documentContext?: string | null;
      }
      
      const payload: MessagePayload = { 
        content: messageContent, // Always use clean text content
        image,
        modelType: selectedModel,
        documentContext, // Include document context if available
        ...modelMetadata // Include any model-specific metadata
      };
      
      // Enhanced logging to explicitly show the model ID being sent to the backend
      console.log("Request payload:", {
        ...payload,
        modelType: selectedModel,
        modelId: payload.modelId || 'not set',
        isOpenRouterSelected: selectedModel === 'openrouter',
        storedCustomModelId: customOpenRouterModelId,
        hasDocumentContext: !!documentContext
      });
      
      const response = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages`,
        payload
      );
      
      // Extract response data
      const data = await response.json();
      
      // Log the received data for debugging
      console.log("Received response from server:", data);
      
      // The backend returns the assistant message directly
      // Check if the response has the expected structure with both userMessage and assistantMessage
      if (data && data.userMessage && data.assistantMessage) {
        // Update the temporary user message and add the assistant message
        console.log('[useChat] Response received. About to update messages with userMessage and assistantMessage');
        console.log('[useChat] Current messages before update:', messages);
        
        setMessages((prev) => {
          // Find and replace the temporary user message
          // Use messageContent which may have been cleaned from JSON string
          const userMsgIndex = prev.findIndex(msg => 
            msg.role === "user" && 
            (msg.content === content || msg.content === messageContent) && 
            msg.id === tempUserMessage.id
          );
          
          console.log(`[useChat] Found user message at index: ${userMsgIndex}, tempUserMessage.id: ${tempUserMessage.id}`);
          
          const newMessages = [...prev];
          if (userMsgIndex !== -1) {
            // Replace the temporary user message with the server-provided one
            console.log('[useChat] Replacing temp user message with server message');
            newMessages[userMsgIndex] = data.userMessage;
          } else {
            // If user message is not found, this could be the bug causing the first message to disappear
            console.log('[useChat] WARNING: Could not find user message to replace. Adding it manually.');
            newMessages.unshift(data.userMessage); // Add to beginning to ensure it appears first
          }
          
          // Add the assistant message if it's not already present
          if (!prev.some(msg => msg.id === data.assistantMessage.id)) {
            newMessages.push(data.assistantMessage);
          }
          
          console.log('[useChat] New messages state will be:', newMessages);
          return newMessages;
        });
      } else if (data && data.role === 'assistant' && data.id) {
        // Fallback for backward compatibility - old API format
        // Add the assistant message to our messages array
        setMessages((prev) => [...prev, data]);
      } else {
        console.error("Invalid response format from server:", data);
        // We'll keep the user message even without a valid assistant response
      }
      
      // Dispatch a custom event to notify that a message was sent (for conversation title updates)
      window.dispatchEvent(new CustomEvent('message-sent', {
        detail: { conversationId }
      }));
      
      // Refresh Skimlinks after getting an AI response
      // Using a slight delay to ensure the DOM has been updated
      setTimeout(() => {
        refreshSkimlinks();
      }, 1000);
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Create a more helpful error message
      let errorMessage = "Failed to get AI response";
      
      if (error instanceof Error) {
        // Check for specific error patterns
        const errorText = error.message.toLowerCase();
        
        if (errorText.includes("failed to fetch") || errorText.includes("network")) {
          errorMessage = "Network connection error. Please check your internet connection.";
        } else if (errorText.includes("timeout")) {
          errorMessage = "Request timed out. The server is taking too long to respond.";
        } else if (errorText.includes("invalid") && errorText.includes("format")) {
          errorMessage = "Server returned an invalid response format. Please try again.";
        } else if (errorText.includes("api key")) {
          errorMessage = "API authentication error. Please try a different model.";
        } else if (error.message.length > 0 && !error.message.includes("[object")) {
          // Use the error message if it's not just a generic object toString
          errorMessage = error.message;
        }
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
      
      // Keep the user message visible even if assistant response fails
      // Only remove in case of critical errors
      // setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      setIsLoadingResponse(false);
    }
  }, [activeConversationId, selectedModel, customOpenRouterModelId, setLocation, toast, messages]);

  // Start a new conversation
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
      
      // Upload document to existing conversation
      return await uploadDocument(activeConversationId, file);
    } catch (error) {
      console.error("Error in handleDocumentUpload:", error);
      throw error;
    }
  }, [activeConversationId, uploadDocument, setLocation]);

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
