import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Conversation } from "@/lib/types";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Close sidebar automatically on mobile when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobile]);

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load conversations",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Create a new conversation
  const createConversation = useCallback(async (title: string): Promise<Conversation> => {
    try {
      const response = await apiRequest("POST", "/api/conversations", { title });
      const newConversation = await response.json();
      
      setConversations((prev) => [newConversation, ...prev]);
      setLocation(`/chat/${newConversation.id}`);
      return newConversation;
    } catch (error) {
      console.error("Error creating conversation:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create conversation",
      });
      throw error;
    }
  }, [setLocation, toast]);

  // Delete a conversation
  const deleteConversation = useCallback(async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/conversations/${id}`);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      toast({
        description: "Conversation deleted",
      });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete conversation",
      });
    }
  }, [toast]);

  // Clear all conversations
  const clearConversations = useCallback(async () => {
    try {
      await apiRequest("DELETE", "/api/conversations");
      setConversations([]);
      toast({
        description: "All conversations cleared",
      });
    } catch (error) {
      console.error("Error clearing conversations:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to clear conversations",
      });
    }
  }, [toast]);

  // Toggle mobile sidebar
  const toggleMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen((prev) => !prev);
  }, []);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);
  
  // Listen for message-sent event to refresh conversations
  useEffect(() => {
    const handleMessageSent = () => {
      // Add a small delay to ensure server has time to update the conversation title
      setTimeout(() => {
        fetchConversations();
      }, 500); // 500ms should be enough for the server to process
    };
    
    window.addEventListener('message-sent', handleMessageSent);
    
    return () => {
      window.removeEventListener('message-sent', handleMessageSent);
    };
  }, [fetchConversations]);

  return {
    conversations,
    isLoading,
    isMobileSidebarOpen,
    toggleMobileSidebar,
    fetchConversations,
    createConversation,
    deleteConversation,
    clearConversations,
  };
};
