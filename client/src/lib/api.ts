import { apiRequest } from "@/lib/queryClient";
import { Conversation, Message } from "@/lib/types";

export const api = {
  conversations: {
    getAll: async (): Promise<Conversation[]> => {
      const response = await fetch("/api/conversations");
      if (!response.ok) throw new Error("Failed to fetch conversations");
      return response.json();
    },
    
    get: async (id: number): Promise<Conversation> => {
      const response = await fetch(`/api/conversations/${id}`);
      if (!response.ok) throw new Error("Failed to fetch conversation");
      return response.json();
    },
    
    create: async (title: string): Promise<Conversation> => {
      const response = await apiRequest("POST", "/api/conversations", { title });
      return response.json();
    },
    
    delete: async (id: number): Promise<void> => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    
    clearAll: async (): Promise<void> => {
      await apiRequest("DELETE", "/api/conversations");
    }
  },
  
  messages: {
    getAll: async (conversationId: number): Promise<Message[]> => {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    
    send: async (conversationId: number, content: string, image?: string, modelType?: string): Promise<{ userMessage: Message, assistantMessage: Message }> => {
      const response = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, { 
        content, 
        image,
        modelType 
      });
      return response.json();
    }
  }
};
