import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Message } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>(undefined);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

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
  const sendMessage = useCallback(async (conversationId: number, content: string) => {
    // If not the active conversation, load it first
    if (activeConversationId !== conversationId) {
      setActiveConversationId(conversationId);
      setLocation(`/conversation/${conversationId}`);
    }

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: Date.now(),
      conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      citations: null,
    };
    
    setMessages((prev) => [...prev, tempUserMessage]);
    setIsLoadingResponse(true);

    try {
      const response = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages`,
        { content }
      );
      
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
      setIsLoadingResponse(false);
    }
  }, [activeConversationId, setLocation, toast]);

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
