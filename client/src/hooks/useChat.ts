import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedModel } = useModelSelection();

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

  // Send a message
  const sendMessage = useCallback(async (conversationId: number, content: string, image?: string) => {
    // If not the active conversation, load it first
    if (activeConversationId !== conversationId) {
      setActiveConversationId(conversationId);
      setLocation(`/chat/${conversationId}`);
    }

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: Date.now(),
      conversationId,
      role: "user",
      content,
      image,
      createdAt: new Date().toISOString(),
      citations: null,
    };
    
    setMessages((prev) => [...prev, tempUserMessage]);
    setIsLoadingResponse(true);

    try {
      // Log request details for debugging
      console.log(`Sending message to conversation ${conversationId} with model: ${selectedModel}`);
      
      const response = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages`,
        { 
          content,
          image,
          modelType: selectedModel  // Include the selected model in the request
        }
      );
      
      // Extract and validate response data
      const data = await response.json();
      
      if (!data || !data.userMessage || !data.assistantMessage) {
        console.error("Invalid API response format:", data);
        throw new Error("The server returned an invalid response format");
      }
      
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
      
      // Create a more helpful error message
      let errorMessage = "Failed to send message";
      
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
      
      // Remove the optimistic message on error
      setMessages((prev) => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      setIsLoadingResponse(false);
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
