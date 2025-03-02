import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";

// Define API key environment variable
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";

// Define the model to use
const PERPLEXITY_MODEL = "llama-3.1-sonar-small-128k-online";

// Perplexity API URL
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes
  app.get("/api/conversations", async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }
      
      const conversation = await storage.createConversation({ 
        title, 
        userId: null // No authentication yet
      });
      
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const messages = await storage.getMessagesByConversation(conversationId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }

      // Create user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content,
        citations: null,
      });

      // Get previous messages to build the context
      const previousMessages = await storage.getMessagesByConversation(conversationId);
      
      // Prepare messages for Perplexity API
      // Filter out any invalid messages and ensure proper role alternation
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      // Sort messages by ID to ensure correct sequence
      filteredMessages.sort((a, b) => a.id - b.id);
      
      const messages = [
        {
          role: "system",
          content: "You are GloriaMundo, an AI assistant focused on bringing the joy of discovery to users. Your goal is to help users explore wonderful things through AI and web search. Be helpful, accurate, and inspiring. Make learning enjoyable and show enthusiasm about discoveries. Format your responses using markdown for better readability.",
        }
      ];
      
      // Ensure proper alternation of user and assistant messages
      let lastRole = "assistant"; // Start with assistant so first user message can be added
      
      for (const msg of filteredMessages) {
        // Only add message if it alternates properly
        if (msg.role !== lastRole) {
          messages.push({
            role: msg.role,
            content: msg.content
          });
          lastRole = msg.role;
        }
      }
      
      // Ensure the last message is from the user
      if (lastRole !== "user") {
        messages.push({
          role: "user",
          content
        });
      }

      // Check if we have an API key
      if (!PERPLEXITY_API_KEY) {
        // No API key, send a mock response
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: "I'm sorry, but the Perplexity API key is not configured. Please set the PERPLEXITY_API_KEY environment variable to access the full functionality of GloriaMundo.",
          citations: null,
        });
        
        return res.json({
          userMessage,
          assistantMessage
        });
      }

      // Call Perplexity API
      try {
        // Log request information
        console.log('Calling Perplexity API with:', {
          model: PERPLEXITY_MODEL,
          messages: JSON.stringify(messages),
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        });

        const payload = {
          model: PERPLEXITY_MODEL,
          messages,
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        };

        const response = await fetch(PERPLEXITY_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Perplexity API error details: ${errorText}`);
          throw new Error(`Perplexity API returned ${response.status}`);
        }

        const data = await response.json();
        
        // Save assistant response
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: data.choices[0].message.content,
          citations: data.citations || null,
        });

        // If this is the first message in the conversation, update the title
        const conversation = await storage.getConversation(conversationId);
        if (conversation && conversation.title === "New Conversation") {
          // Generate a title based on the first user message
          await storage.updateConversationTitle(
            conversationId, 
            content.length > 30 ? content.substring(0, 30) + "..." : content
          );
        }

        res.json({
          userMessage,
          assistantMessage,
        });
      } catch (error) {
        console.error('Error calling Perplexity API:', error);
        
        // Create a fallback response
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: "I apologize, but I encountered an error while processing your request. Please try again later.",
          citations: null,
        });
        
        res.json({
          userMessage,
          assistantMessage
        });
      }
    } catch (error) {
      console.error('Server error:', error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.delete("/api/conversations", async (req, res) => {
    try {
      await storage.clearConversations();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear conversations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
