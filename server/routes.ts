import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";
import 'express-session';

// Extend SessionData interface for express-session
declare module 'express-session' {
  interface SessionData {
    userConversations?: number[]; // Array of conversation IDs
  }
}

// Define API key environment variable
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";

// Define the model to use
const PERPLEXITY_MODEL = "llama-3.1-sonar-small-128k-online";

// Perplexity API URL
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export async function registerRoutes(app: Express): Promise<Server> {

  // Serve ads.txt and sitemap.xml at the root level
  app.get("/ads.txt", (req, res) => {
    res.sendFile("client/public/ads.txt", { root: "." });
  });
  
  app.get("/sitemap.xml", (req, res) => {
    res.sendFile("client/public/sitemap.xml", { root: "." });
  });

  // API routes
  app.get("/api/conversations", async (req, res) => {
    try {
      // Initialize session user conversations if not exists
      if (!req.session.userConversations) {
        req.session.userConversations = [];
      }
      
      // Get all conversations
      const allConversations = await storage.getConversations();
      
      // If session has no conversations yet but there are conversations in storage,
      // restore them to the session (this helps with persistence)
      if (req.session.userConversations.length === 0 && allConversations.length > 0) {
        // Store all conversation IDs in the session
        req.session.userConversations = allConversations.map(conv => conv.id);
        await new Promise<void>((resolve) => {
          req.session.save(() => resolve());
        });
        console.log("Restored conversations to session:", req.session.userConversations);
      }
      
      // Get all conversations and filter by user session if available
      const userConversations = req.session.userConversations.length > 0
        ? allConversations.filter(conv => req.session.userConversations?.includes(conv.id))
        : allConversations;
      
      // Log the filtered conversations
      console.log(`Returning ${userConversations.length} conversations for session`);
      
      res.json(userConversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }
      
      // Initialize session user conversations if not exists
      if (!req.session.userConversations) {
        req.session.userConversations = [];
      }
      
      const conversation = await storage.createConversation({ 
        title, 
        userId: null // No authentication yet
      });
      
      // Add conversation ID to user session
      req.session.userConversations.push(conversation.id);
      // Save session changes
      req.session.save();
      
      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
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
          content: `You are GloriaMundo ("Glory of the World"), an AI assistant powered by Perplexity's Sonar-reasoning API. Your mission is to illuminate the wonder and joy available in the world while providing truthful, helpful information.

Core Values:
- Truth with Optimism: Always provide factually accurate information, but frame it with an optimistic perspective when appropriate.
- Joy-Centric Search: When searching for and presenting information, prioritize content that inspires joy, wonder, and positivity.
- Solution-Oriented: Focus on highlighting solutions, opportunities, and possibilities rather than dwelling on problems.
- Life Enhancement: Regularly identify products, services, and resources that can genuinely improve the user's life and bring more ease, joy, or fun.

Response Guidelines:
- Positive Framing: Present information in a way that emphasizes positive aspects and potential without distorting facts.
- Balanced Optimism: While maintaining a positive bias, avoid toxic positivity. Acknowledge challenges but focus on constructive approaches.
- Opportunity Highlighting: When discussing topics, highlight opportunities for growth, learning, or enjoyment.
- Product & Service Recommendations: When relevant to the query, include thoughtfully selected products or services that could genuinely enhance the user's experience with the topic at hand.
- Joy Multipliers: Identify ways the user can build upon positive aspects of their query to further enhance joy or satisfaction.

Search Behavior:
- Prioritize search results that contain positive, solution-oriented content
- For ambiguous queries, prefer interpretations that lead to constructive, joyful explorations
- When multiple perspectives exist on a topic, give preference to those that offer constructive viewpoints while still acknowledging the full spectrum of thought
- Regularly include practical resources that can help users implement positive changes

Tone:
Your communication style should be:
- Warm and encouraging
- Genuinely enthusiastic about possibilities
- Thoughtful and nuanced
- Focused on empowerment and agency
- Friendly but not overly familiar
- Professional yet conversational

Remember that your purpose is to reveal the glory of the world through truthful, joy-oriented information and practical resources that enhance the user's life.

Format your responses using markdown for better readability.`,
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
        
        // Update the conversation title even without API key
        const conversation = await storage.getConversation(conversationId);
        if (conversation && conversation.title === "New Conversation") {
          // Generate an intelligent title based on the content
          let generatedTitle = "";
          
          // Extract main topic from first user message
          if (content.length <= 25) {
            // If message is short, use it directly
            generatedTitle = content;
          } else {
            // Try to extract an intelligent title by keeping key phrases
            // First, try to extract a question
            const questionMatch = content.match(/^(What|How|Why|When|Where|Which|Who|Can|Could|Should|Is|Are).+?\?/i);
            if (questionMatch && questionMatch[0].length < 50) {
              generatedTitle = questionMatch[0];
            } else {
              // Extract first sentence or meaningful chunk
              const sentenceEnd = content.indexOf('.');
              const firstChunk = sentenceEnd > 0 && sentenceEnd < 40 
                ? content.substring(0, sentenceEnd + 1) 
                : content.substring(0, Math.min(content.length, 40));
              
              // Split by common stop words and take first few meaningful words
              const words = firstChunk.split(/\s+/);
              generatedTitle = words.slice(0, 5).join(' ');
              
              // Ensure title doesn't end abruptly
              if (words.length > 5 && !generatedTitle.endsWith('.')) {
                generatedTitle += '...';
              }
            }
          }
          
          // Clean up title - remove quotes and excessive punctuation
          generatedTitle = generatedTitle
            .replace(/^["']|["']$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Ensure title is not too long
          if (generatedTitle.length > 40) {
            generatedTitle = generatedTitle.substring(0, 37) + '...';
          }
          
          await storage.updateConversationTitle(conversationId, generatedTitle);
        }
        
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

        // If this is the first message in the conversation, generate a better title without extra API calls
        const conversation = await storage.getConversation(conversationId);
        if (conversation && conversation.title === "New Conversation") {
          // Generate an intelligent title based on the content
          let generatedTitle = "";
          
          // Extract main topic from first user message
          if (content.length <= 25) {
            // If message is short, use it directly
            generatedTitle = content;
          } else {
            // Try to extract an intelligent title by keeping key phrases
            // First, try to extract a question
            const questionMatch = content.match(/^(What|How|Why|When|Where|Which|Who|Can|Could|Should|Is|Are).+?\?/i);
            if (questionMatch && questionMatch[0].length < 50) {
              generatedTitle = questionMatch[0];
            } else {
              // Extract first sentence or meaningful chunk
              const sentenceEnd = content.indexOf('.');
              const firstChunk = sentenceEnd > 0 && sentenceEnd < 40 
                ? content.substring(0, sentenceEnd + 1) 
                : content.substring(0, Math.min(content.length, 40));
              
              // Split by common stop words and take first few meaningful words
              const words = firstChunk.split(/\s+/);
              generatedTitle = words.slice(0, 5).join(' ');
              
              // Ensure title doesn't end abruptly
              if (words.length > 5 && !generatedTitle.endsWith('.')) {
                generatedTitle += '...';
              }
            }
          }
          
          // Clean up title - remove quotes and excessive punctuation
          generatedTitle = generatedTitle
            .replace(/^["']|["']$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Ensure title is not too long
          if (generatedTitle.length > 40) {
            generatedTitle = generatedTitle.substring(0, 37) + '...';
          }
          
          // Update the conversation title
          await storage.updateConversationTitle(conversationId, generatedTitle);
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
      
      // Remove from session if it exists
      if (req.session.userConversations) {
        req.session.userConversations = req.session.userConversations.filter(
          convId => convId !== id
        );
        req.session.save();
      }
      
      await storage.deleteConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
    }
  });

  app.delete("/api/conversations", async (req, res) => {
    try {
      // Clear user session conversations
      if (req.session.userConversations) {
        req.session.userConversations = [];
        req.session.save();
      }
      
      await storage.clearConversations();
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing conversations:", error);
      res.status(500).json({ message: "Failed to clear conversations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
