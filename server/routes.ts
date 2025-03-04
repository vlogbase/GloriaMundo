import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";

type ModelType = "reasoning" | "search" | "multimodal";
import 'express-session';

// Extend SessionData interface for express-session
declare module 'express-session' {
  interface SessionData {
    userConversations?: number[]; // Array of conversation IDs
  }
}

// Define API keys with proper validation
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// Validate API keys on startup
const isPerplexityKeyValid = PERPLEXITY_API_KEY && PERPLEXITY_API_KEY.length > 10;
const isGroqKeyValid = GROQ_API_KEY && GROQ_API_KEY.length > 10;

console.log("API Key Status:");
console.log(`- Perplexity API Key: ${isPerplexityKeyValid ? "Valid" : "Invalid or Missing"}`);
console.log(`- Groq API Key: ${isGroqKeyValid ? "Valid" : "Invalid or Missing"}`);

// Function to validate API key at request time
function isValidApiKey(key: string | undefined | null): boolean {
  if (!key) return false;
  if (typeof key !== 'string') return false;
  return key.length > 10;
}

// Define model configurations
const MODEL_CONFIGS = {
  reasoning: {
    apiProvider: "groq",
    modelName: "deepseek-r1-distill-llama-70b",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: GROQ_API_KEY
  },
  search: {
    apiProvider: "perplexity",
    modelName: "sonar-small-online",  // Updated to a valid model name
    apiUrl: "https://api.perplexity.ai/chat/completions",
    apiKey: PERPLEXITY_API_KEY
  },
  multimodal: {
    apiProvider: "groq",
    modelName: "llama-3.3-70b-versatile",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: GROQ_API_KEY
  }
};

export async function registerRoutes(app: Express): Promise<Server> {

  // Debug API keys route
  app.get("/api/debug/keys", (req, res) => {
    // Safe way to check if keys exist without exposing them
    const perplexityKeyStatus = PERPLEXITY_API_KEY ? "exists (length: " + PERPLEXITY_API_KEY.length + ")" : "missing";
    const groqKeyStatus = GROQ_API_KEY ? "exists (length: " + GROQ_API_KEY.length + ")" : "missing";
    
    res.json({
      perplexityKey: perplexityKeyStatus,
      perplexityKeyValid: isValidApiKey(PERPLEXITY_API_KEY),
      groqKey: groqKeyStatus,
      groqKeyValid: isValidApiKey(GROQ_API_KEY),
      envVars: Object.keys(process.env).filter(key => key.includes("API") || key.includes("KEY"))
    });
  });
  
  // Test API connections without sending real messages
  app.get("/api/debug/test-connection/:provider", async (req, res) => {
    const { provider } = req.params;
    
    try {
      let apiUrl, apiKey, modelName;
      
      if (provider === "groq") {
        apiUrl = "https://api.groq.com/openai/v1/models";
        apiKey = GROQ_API_KEY;
        modelName = "models list";
      } else if (provider === "perplexity") {
        apiUrl = "https://api.perplexity.ai/chat/completions";
        apiKey = PERPLEXITY_API_KEY;
        modelName = "test connection";
      } else {
        return res.status(400).json({ error: "Invalid provider. Use 'groq' or 'perplexity'." });
      }
      
      if (!isValidApiKey(apiKey)) {
        return res.status(400).json({ 
          error: `No valid API key for ${provider}`, 
          keyValid: false,
          keyExists: !!apiKey,
          keyLength: apiKey ? apiKey.length : 0
        });
      }
      
      // For Perplexity, we need to send a minimal request since they don't have a models endpoint
      if (provider === "perplexity") {
        const testPayload = {
          model: "sonar-small-online", // Using a valid model name
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Keep your response very short."
            },
            {
              role: "user",
              content: "Test connection. Say 'CONNECTION_OK' if you can hear me."
            }
          ],
          max_tokens: 20
        };
        
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(testPayload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({ 
            error: `API returned ${response.status}`, 
            details: errorText,
            provider
          });
        }
        
        return res.json({ 
          success: true, 
          provider,
          status: "Connected successfully"
        });
      }
      
      // For Groq, use their models endpoint
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: `API returned ${response.status}`, 
          details: errorText,
          provider
        });
      }
      
      return res.json({ 
        success: true, 
        provider,
        status: "Connected successfully"
      });
    } catch (error) {
      console.error(`Error testing ${provider} API connection:`, error);
      return res.status(500).json({ 
        error: "Failed to test API connection", 
        provider,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

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
      const { content, modelType = "reasoning" } = req.body;
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Get the model configuration based on the requested model type
      const modelConfig = MODEL_CONFIGS[modelType as keyof typeof MODEL_CONFIGS] || MODEL_CONFIGS.reasoning;

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
      
      // Create model-specific system message
      let systemContent = `You are GloriaMundo ("Glory of the World"), an AI assistant powered by ${modelConfig.apiProvider}'s ${modelConfig.modelName} model. Your mission is to illuminate the wonder and joy available in the world while providing truthful, helpful information.

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
- Joy Multipliers: Identify ways the user can build upon positive aspects of their query to further enhance joy or satisfaction.`;

      // Add model-specific instructions
      if (modelType === "search") {
        systemContent += `\n\nSearch Behavior:
- Prioritize search results that contain positive, solution-oriented content
- For ambiguous queries, prefer interpretations that lead to constructive, joyful explorations
- When multiple perspectives exist on a topic, give preference to those that offer constructive viewpoints while still acknowledging the full spectrum of thought
- Regularly include practical resources that can help users implement positive changes`;
      } else if (modelType === "multimodal") {
        systemContent += `\n\nMultimodal Capabilities:
- When responding to queries that would benefit from visual examples, indicate where images would be helpful
- Describe visual concepts clearly when they are relevant to the query
- For instructions that involve visual steps, structure your response in a clear, step-by-step format`;
      } else {
        systemContent += `\n\nReasoning Approach:
- Break down complex concepts into understandable parts
- Use logical reasoning and structured thinking to explore topics deeply
- Connect ideas across different domains when relevant
- Provide thoughtful analysis that goes beyond surface-level information`;
      }

      systemContent += `\n\nTone:
Your communication style should be:
- Warm and encouraging
- Genuinely enthusiastic about possibilities
- Thoughtful and nuanced
- Focused on empowerment and agency
- Friendly but not overly familiar
- Professional yet conversational

Remember that your purpose is to reveal the glory of the world through truthful, joy-oriented information and practical resources that enhance the user's life.

Format your responses using markdown for better readability.`;

      const messages = [
        {
          role: "system",
          content: systemContent,
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

      // Check if we have the required API key for the selected model
      if (!isValidApiKey(modelConfig.apiKey)) {
        console.error(`Invalid or missing API key for ${modelType} model (provider: ${modelConfig.apiProvider})`);
        // No valid API key, send a mock response
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: `I'm sorry, but the ${modelType} model is not available because the API key is not configured. Please select a different model or contact the administrator.`,
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

      // Call AI API based on the selected model
      try {
        // Log request information
        console.log(`Calling ${modelType} API (${modelConfig.apiProvider}) with:`, {
          model: modelConfig.modelName,
          messages: JSON.stringify(messages),
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        });

        const payload = {
          model: modelConfig.modelName,
          messages,
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        };

        // Log the API request details for debugging (without exposing the full key)
        const keyLength = modelConfig.apiKey.length;
        const maskedKey = keyLength >= 10 
          ? `${modelConfig.apiKey.substring(0, 5)}...${modelConfig.apiKey.substring(keyLength - 5)}` 
          : "***";
        
        console.log(`API Request to ${modelConfig.apiUrl}:`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${maskedKey}`
          },
          payload: {
            model: payload.model,
            temperature: payload.temperature,
            top_p: payload.top_p,
            // Redact full messages to avoid logging sensitive data
            messagesCount: payload.messages.length
          }
        });
        
        const response = await fetch(modelConfig.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${modelConfig.apiKey}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`${modelConfig.apiProvider} API error details: ${errorText}`);
          throw new Error(`${modelConfig.apiProvider} API returned ${response.status}`);
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
        console.error(`Error calling ${modelConfig.apiProvider} API:`, error);
        
        // Create a fallback response
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: `I apologize, but I encountered an error while processing your request with the ${modelType} model. Please try again or select a different model.`,
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
