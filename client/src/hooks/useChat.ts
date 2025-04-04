import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";
import { refreshSkimlinks } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useModelSelection } from "@/hooks/useModelSelection";

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedModel, customOpenRouterModelId } = useModelSelection();

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
      
      // Set the messages directly without adding test links
      setMessages(data);
      setActiveConversationId(conversationId);
      
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
      console.log(`Current customOpenRouterModelId: ${customOpenRouterModelId}`);
      
      // Prepare model metadata
      let modelMetadata = {};
      
      // If using OpenRouter, include model ID in the request
      if (selectedModel === 'openrouter' && customOpenRouterModelId) {
        console.log(`Using OpenRouter model: ${customOpenRouterModelId}`);
        modelMetadata = { modelId: customOpenRouterModelId };
      } else if (selectedModel === 'openrouter' && !customOpenRouterModelId) {
        // Safety catch - if we're set to OpenRouter but don't have a model ID, log warning
        console.warn("OpenRouter selected but no model ID provided");
      }
      
      const payload = { 
        content: content, // Use content directly - no parsing needed
        image,
        modelType: selectedModel,
        ...modelMetadata // Include any model-specific metadata
      };
      
      console.log("Request payload:", payload);
      
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
      // Check if the response has necessary Message properties
      if (data && data.role === 'assistant' && data.id) {
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
  }, [activeConversationId, selectedModel, customOpenRouterModelId, setLocation, toast]);

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
