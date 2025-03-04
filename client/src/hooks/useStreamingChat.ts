import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";

export const useStreamingChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
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
      
      // For streaming (reasoning model), use SSE
      if (selectedModel === "reasoning") {
        // Reset the streaming message ref
        streamingMessageRef.current = null;
        
        // Create a new EventSource connection
        const eventSource = new EventSource(`/api/conversations/${conversationId}/messages/stream?content=${encodeURIComponent(content)}${image ? `&image=${encodeURIComponent(image)}` : ''}&modelType=${selectedModel}`);
        eventSourceRef.current = eventSource;
        
        // Handle the different event types
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          // Handle different event types
          switch (data.type) {
            case "initial":
              // Keep both the temporary user message and add the real one for debugging
              console.log("Received initial event with user message:", data.userMessage);
              
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
              // Final update with the complete message, only update the assistant message
              // but keep the user message as is
              setMessages((prev) => prev.map(msg => 
                msg.id === data.assistantMessage.id ? data.assistantMessage : msg
              ));
              
              // Clean up
              setIsLoadingResponse(false);
              eventSource.close();
              eventSourceRef.current = null;
              streamingMessageRef.current = null;
              
              // Dispatch a custom event to notify that a message was sent (for conversation title updates)
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
            description: "Lost connection to the server. Please try again.",
          });
          
          // Clean up
          setIsLoadingResponse(false);
          eventSource.close();
          eventSourceRef.current = null;
          
          // If we have a partial message, keep it
          if (streamingMessageRef.current) {
            setMessages((prev) => prev.map(msg => 
              msg.id === streamingMessageRef.current?.id 
                ? { ...msg, content: msg.content + "\n\n*Connection lost. Message may be incomplete.*" } 
                : msg
            ));
            streamingMessageRef.current = null;
          }
        };
        
        // Return early as the event source will handle the rest
        return;
      }
      
      // For non-streaming models (search, multimodal), use regular fetch
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
      
      // We already added the user message optimistically - just replace it with the real one and add assistant message
      setMessages((prev) => 
        prev
          .map(msg => msg.id === tempUserMessage.id ? data.userMessage : msg)
          .concat([data.assistantMessage])
      );
      
      // Dispatch a custom event to notify that a message was sent (for conversation title updates)
      window.dispatchEvent(new CustomEvent('message-sent', {
        detail: { conversationId }
      }));
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
      if (selectedModel !== "reasoning") {
        setIsLoadingResponse(false);
      }
    }
  }, [activeConversationId, selectedModel, setLocation, toast]);

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
    activeConversationId,
    loadConversation,
    sendMessage,
    startNewConversation,
  };
};