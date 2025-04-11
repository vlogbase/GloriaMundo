import { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer, Server } from 'http';
import multer from 'multer';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import { z } from 'zod';
import { WebSocketServer } from 'ws';

import { db } from './db';
import { 
  users, 
  conversations, 
  messages, 
  documents,
  usageLogs,
  insertConversationSchema, 
  insertMessageSchema 
} from '@shared/schema';
import { eq, and, desc, asc, sql, like } from 'drizzle-orm';
import { generateEmbedding, findSimilarChunks, formatContextForPrompt } from './documentProcessor';
import fetch from 'node-fetch';
import { calculateCreditsToCharge } from './paypal';
import { parseOpenRouterError, handleInternalError, ApiError, sendErrorResponse } from './errorHandler';
import { storage } from './storage';
import { contentStorage } from './contentStorage';
import { BullMQService } from './bullmq';
import { addJobToQueue, initBullMQService } from './documentQueue';
import { count } from 'drizzle-orm';
import { mongoDb } from './mongodb';

// Initialize BullMQ service
const bullMQService = new BullMQService();
initBullMQService(bullMQService);

// Setup multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB size limit
  },
});

/**
 * Generates and saves a conversation title based on the first user message
 * Uses an AI model to generate a concise, meaningful title
 */
async function generateAndSaveConversationTitle(conversationId: number): Promise<void> {
  try {
    // Fetch the first user message for this conversation
    const firstMessage = await db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, 'user')
      ),
      orderBy: asc(messages.createdAt)
    });
    
    if (!firstMessage?.content) {
      console.log(`No initial user message found for conversation ${conversationId}`);
      return;
    }
    
    // Use a fast model to generate a title
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      console.log('OpenRouter API key not found, skipping title generation');
      return;
    }
    
    console.log(`Generating title for conversation ${conversationId}`);
    
    // Use a cheaper, faster model for title generation
    const titleModel = 'openai/o3-mini';
    
    const prompt = `Create a very concise title (max 6 words) that summarizes this chat message. Respond with just the title, no quotes or additional text: "${firstMessage.content}"`;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': process.env.HTTP_REFERER || 'https://gloriamundo.com',
        'X-Title': 'GloriaMundo'
      },
      body: JSON.stringify({
        model: titleModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 30
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate title: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    let title = data.choices[0].message.content.trim();
    
    // Remove quotes if present
    title = title.replace(/^["']|["']$/g, '');
    
    // Limit to 100 characters
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }
    
    // Update the conversation with the new title
    await db.update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    
    console.log(`Title generated for conversation ${conversationId}: "${title}"`);
  } catch (error) {
    console.error('Error generating conversation title:', error);
    // Don't throw - this is a non-critical operation that shouldn't break the main flow
  }
}

// Define model types for clarity
type ModelType = "reasoning" | "search" | "multimodal";

// Define Express namespace for user type
declare global {
  namespace Express {
    interface User {
      id: number;
      googleId: string;
      email: string;
      name: string;
      avatarUrl: string;
      creditBalance: number;
      createdAt: Date;
      updatedAt: Date;
    }
  }
}

// Middleware to ensure user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

// Helper for constructing multimodal messages
type MultimodalContentItem = 
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface MultimodalMessage {
  role: string;
  content: MultimodalContentItem[];
}

// Generic API message type that can be either text-only or multimodal
type ApiMessage = 
  | { role: string; content: string }
  | MultimodalMessage;

// Helper for tracking user conversations in session
declare module 'express-session' {
  interface SessionData {
    userConversations?: number[]; // Array of conversation IDs
  }
}

// Verify API key format
function isValidApiKey(key: string | undefined | null): boolean {
  return !!key && typeof key === 'string' && key.length > 20;
}

// Register API routes
export async function registerRoutes(app: Express): Promise<Server> {
  
  // Config endpoint to expose public environment variables for the client
  app.get("/api/config", (req, res) => {
    res.json({
      paypalClientId: process.env.PAYPAL_CLIENT_ID || ""
    });
  });
  
  // Google OAuth Routes
  app.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );
  
  app.get('/auth/google/callback', 
    passport.authenticate('google', { 
      failureRedirect: '/login-error',
      successRedirect: '/'
    })
  );
  
  // Get current user info
  app.get('/api/auth/me', (req, res) => {
    if (req.isAuthenticated()) {
      // Return user data without sensitive info
      const user = req.user;
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        creditBalance: user.creditBalance
      });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });
  
  // Get user model presets
  app.get('/api/user/presets', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const userPresets = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          preset1ModelId: true,
          preset2ModelId: true,
          preset3ModelId: true,
          preset4ModelId: true,
          preset5ModelId: true,
          preset6ModelId: true
        }
      });
      
      if (!userPresets) {
        return res.status(404).json({ message: "User presets not found" });
      }
      
      res.json({
        preset1: userPresets.preset1ModelId,
        preset2: userPresets.preset2ModelId,
        preset3: userPresets.preset3ModelId,
        preset4: userPresets.preset4ModelId,
        preset5: userPresets.preset5ModelId,
        preset6: userPresets.preset6ModelId
      });
    } catch (error) {
      console.error("Error getting user presets:", error);
      res.status(500).json({ message: "Error getting user presets" });
    }
  });
  
  // Update user model presets
  app.put('/api/user/presets', isAuthenticated, async (req, res) => {
    try {
      // Define schema using camelCase to match front-end naming
      const presetsSchema = z.object({
        preset1: z.string().nullable(),
        preset2: z.string().nullable(),
        preset3: z.string().nullable(),
        preset4: z.string().nullable(),
        preset5: z.string().nullable(),
        preset6: z.string().nullable()
      });
      
      const validationResult = presetsSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid preset data", 
          errors: validationResult.error.errors 
        });
      }
      
      const userId = req.user!.id;
      const { preset1, preset2, preset3, preset4, preset5, preset6 } = validationResult.data;
      
      // Create a transformed object mapping frontend keys to database column names
      const dbPresets = {
        preset1ModelId: preset1,
        preset2ModelId: preset2,
        preset3ModelId: preset3,
        preset4ModelId: preset4,
        preset5ModelId: preset5,
        preset6ModelId: preset6,
        updatedAt: new Date()
      };
      
      console.log('Updating user presets in database:', {
        userId,
        presetCount: Object.keys(validationResult.data).length,
        dbColumns: Object.keys(dbPresets)
      });
      
      try {
        // Update the database using the transformed object
        await db.update(users)
          .set(dbPresets)
          .where(eq(users.id, userId));
          
        console.log('User presets updated successfully');
      } catch (dbError) {
        console.error('Database error while updating presets:', dbError);
        throw new Error(`Database update failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
      
      // Return the data in the format expected by the frontend
      res.json({
        preset1,
        preset2,
        preset3,
        preset4,
        preset5,
        preset6
      });
    } catch (error) {
      console.error("Error updating user presets:", error);
      res.status(500).json({ 
        message: "Error updating user presets",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Logout route
  app.get('/api/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error during logout", error: err.message });
      }
      res.redirect('/');
    });
  });
  
  // Debug API keys route
  app.get('/api/debug/api-keys', (req, res) => {
    // Create an object to store the status of each API key
    const apiKeyStatus = {
      perplexityApiKey: isValidApiKey(process.env.PERPLEXITY_API_KEY) ? "Valid" : "Invalid or Missing",
      groqApiKey: isValidApiKey(process.env.GROQ_API_KEY) ? "Valid" : "Invalid or Missing",
      openRouterApiKey: isValidApiKey(process.env.OPENROUTER_API_KEY) ? "Valid" : "Invalid or Missing",
    };
    
    // Log to console
    console.log("API Key Status:");
    console.log(`- Perplexity API Key: ${apiKeyStatus.perplexityApiKey}`);
    console.log(`- Groq API Key: ${apiKeyStatus.groqApiKey}`);
    console.log(`- OpenRouter API Key: ${apiKeyStatus.openRouterApiKey}`);
    
    res.json(apiKeyStatus);
  });
  
  // Get available models from OpenRouter
  app.get('/api/openrouter/models', async (req, res) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ message: "OpenRouter API key not configured" });
      }
      
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.HTTP_REFERER || 'https://gloriamundo.com',
          'X-Title': 'GloriaMundo'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch models: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      
      // Flag models that are free to use
      // Create a transformed list with isFree property added
      const modelsWithFreeTag = data.data.map((model: any) => {
        return {
          ...model,
          isFree: model.id.includes(':free') // Check if model ID includes ':free' suffix
        };
      });
      
      res.json(modelsWithFreeTag);
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      res.status(500).json({ message: "Error fetching available models" });
    }
  });
  
  // Create a new conversation
  app.post('/api/conversations', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      const [newConversation] = await db.insert(conversations)
        .values({
          userId,
          title: 'New Conversation'
        })
        .returning();
      
      // Initialize session array if it doesn't exist
      if (!req.session.userConversations) {
        req.session.userConversations = [];
      }
      
      // Add the new conversation ID to the session
      req.session.userConversations.push(newConversation.id);
      
      res.status(201).json(newConversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Error creating conversation" });
    }
  });
  
  // Get user's conversations
  app.get('/api/conversations', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const offset = (page - 1) * pageSize;
      
      // Get total count for pagination
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(conversations)
        .where(eq(conversations.userId, userId));
      
      // Get paginated conversations
      const userConversations = await db.query.conversations.findMany({
        where: eq(conversations.userId, userId),
        orderBy: desc(conversations.updatedAt),
        limit: pageSize,
        offset: offset
      });
      
      res.json({
        conversations: userConversations,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Error fetching conversations" });
    }
  });
  
  // Get messages for a conversation
  app.get('/api/conversations/:id/messages', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify this conversation belongs to the user
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      });
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      const conversationMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: asc(messages.createdAt)
      });
      
      res.json(conversationMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Error fetching messages" });
    }
  });
  
  // Generate a chat completion
  app.post('/api/conversations/:id/messages', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify this conversation belongs to the user
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      });
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Required query parameters
      const modelType = req.query.modelType as string || 'openrouter';
      const modelId = req.query.modelId as string;
      
      // Create a new user message
      const messageSchema = z.object({
        content: z.string().min(1),
        image: z.string().optional()
      });
      
      const validationResult = messageSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid message data", 
          errors: validationResult.error.errors 
        });
      }
      
      const { content, image } = validationResult.data;
      
      // Verify user has enough credits
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Skip credit check for free models
      const isFreeModel = modelId.includes(':free');
      
      if (!isFreeModel && user.creditBalance <= 0) {
        return res.status(402).json({ 
          message: "Insufficient credits. Please add funds to your account.",
          creditsNeeded: true
        });
      }
      
      // For title generation, only do it if this is the first message
      const messageCount = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        columns: {
          id: true
        }
      });
      
      const isFirstMessage = messageCount.length === 0;
      
      // Save the user message to the database
      const [userMessage] = await db.insert(messages)
        .values({
          conversationId,
          role: 'user',
          content,
          image: image || null,
          modelId: null // User messages don't have a model ID
        })
        .returning();
      
      // Generate title if this is the first message
      if (isFirstMessage) {
        // Don't await this - we want it to happen in the background
        generateAndSaveConversationTitle(conversationId);
      }
      
      // Get conversation history for context
      const conversationMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversationId),
        orderBy: asc(messages.createdAt)
      });
      
      // Convert messages to the format expected by OpenRouter API
      const apiMessages: ApiMessage[] = await Promise.all(conversationMessages.map(async (msg) => {
        if (msg.image) {
          // This is a multimodal message with an image
          const multimodalMessage: MultimodalMessage = {
            role: msg.role,
            content: [
              { type: "text", text: msg.content },
              { type: "image_url", image_url: { url: msg.image } }
            ]
          };
          return multimodalMessage;
        } else {
          // Regular text message
          return {
            role: msg.role,
            content: msg.content
          };
        }
      }));
      
      // Start an HTTP stream 
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Initial placeholder for the AI message in database
      const [assistantMessage] = await db.insert(messages)
        .values({
          conversationId,
          role: 'assistant',
          content: '',
          modelId: modelId // Store which model is generating this response
        })
        .returning();
      
      // Set up variables to track tokens
      let promptTokens = 0;
      let completionTokens = 0;
      let fullResponse = '';
      let citations = null;
      
      try {
        // Fetch documents specific to this conversation
        let contextForRAG = '';
        
        // Add RAG context from conversation documents
        try {
          const similarChunks = await findSimilarChunks(content, conversationId, 5, userId);
          if (similarChunks && similarChunks.length > 0) {
            contextForRAG = formatContextForPrompt(similarChunks);
          }
        } catch (ragError) {
          console.error('Error retrieving RAG context:', ragError);
          // Continue without RAG if it fails
        }
        
        let apiUrl: string;
        let apiHeaders: Record<string, string>;
        let apiBody: any;
        
        // Handle different model types with appropriate API endpoints
        const openRouterApiKey = process.env.OPENROUTER_API_KEY;
        
        // Check credentials based on model type
        if (!openRouterApiKey) {
          return res.status(500).json({ message: "Required API credentials not configured" });
        }
        
        let isMultimodalRequest = false;
        
        if (modelType === 'multimodal' || apiMessages.some(msg => 'content' in msg && Array.isArray(msg.content))) {
          // This is a multimodal request with images
          isMultimodalRequest = true;
          
          // Prepare multimodal request for OpenRouter
          apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
          apiHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': process.env.HTTP_REFERER || 'https://gloriamundo.com',
            'X-Title': 'GloriaMundo'
          };
          
          const multimodalMessages = apiMessages;
          
          // Add RAG context if available
          if (contextForRAG) {
            // Add RAG context as a system message
            multimodalMessages.unshift({
              role: 'system',
              content: `The following information may be relevant to the user's query:\n${contextForRAG}`
            });
          }
          
          apiBody = {
            model: modelId,
            messages: multimodalMessages,
            stream: true,
            max_tokens: 4000,
          };
        } 
        else if (modelType === 'openrouter' || modelType === 'reasoning' || modelType === 'search') {
          // Standard OpenRouter request
          apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
          apiHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': process.env.HTTP_REFERER || 'https://gloriamundo.com',
            'X-Title': 'GloriaMundo'
          };
          
          const openRouterMessages = apiMessages.map(msg => {
            // Ensure we're only sending content as string for text-only models
            return {
              role: msg.role,
              content: typeof msg.content === 'string' ? msg.content : msg.content[0].text
            };
          });
          
          // Add RAG context if available
          if (contextForRAG) {
            // Add RAG context as a system message
            openRouterMessages.unshift({
              role: 'system',
              content: `The following information may be relevant to the user's query:\n${contextForRAG}`
            });
          }
          
          apiBody = {
            model: modelId,
            messages: openRouterMessages,
            stream: true,
            max_tokens: 4000,
          };
        } else {
          let apiError: ApiError;
          apiError = {
            status: 400,
            category: 'bad_request',
            message: `Unsupported model type: ${modelType}`,
            userMessage: `The model type "${modelType}" is not supported.`
          };
          sendErrorResponse(res, apiError);
          return;
        }
        
        console.log(`Sending request to API for model type: ${modelType}, model ID: ${modelId}`);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(apiBody)
        });
        
        if (!response.ok || !response.body) {
          let errorText = await response.text();
          console.error(`API error (${response.status}): ${errorText}`);
          
          // If using OpenRouter, parse the error
          let apiError = parseOpenRouterError(response.status, errorText);
          sendErrorResponse(res, apiError);
          
          // Update the placeholder message to indicate the error
          await db.update(messages)
            .set({ 
              content: `Error: ${apiError.userMessage}`,
              updatedAt: new Date()
            })
            .where(eq(messages.id, assistantMessage.id));
          
          return;
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        let buffer = '';
        
        // Process the stream
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Decode the received chunk
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete SSE messages in the buffer
          let lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              // Check for [DONE] message
              if (data.trim() === '[DONE]') {
                continue;
              }
              
              try {
                const parsed = JSON.parse(data);
                
                // Extract the delta content
                let deltaContent = '';
                let finishReason = null;
                
                if (parsed.choices && parsed.choices[0]) {
                  if (parsed.choices[0].delta && parsed.choices[0].delta.content) {
                    deltaContent = parsed.choices[0].delta.content;
                  }
                  
                  finishReason = parsed.choices[0].finish_reason;
                  
                  // Update token counts if available
                  if (parsed.usage) {
                    promptTokens = parsed.usage.prompt_tokens || promptTokens;
                    completionTokens = parsed.usage.completion_tokens || completionTokens;
                  }
                  
                  // Update citations if available
                  if (parsed.choices[0].delta && parsed.choices[0].delta.citations) {
                    citations = parsed.choices[0].delta.citations;
                  }
                }
                
                // Append to the full response
                fullResponse += deltaContent;
                
                // Send the delta to the client
                res.write(deltaContent);
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError);
              }
            }
          }
        }
        
        // Close the stream
        res.end();
        
        // Update the assistant message with the complete response
        await db.update(messages)
          .set({ 
            content: fullResponse,
            citations: citations,
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            updatedAt: new Date()
          })
          .where(eq(messages.id, assistantMessage.id));
        
        // Calculate and deduct credits
        if (!isFreeModel) {
          const creditsToCharge = calculateCreditsToCharge(
            modelId,
            promptTokens || 0,
            completionTokens || 0,
            isMultimodalRequest ? 1 : 0 // Count 1 image if multimodal request
          );
          
          // Update user's credit balance
          await db.update(users)
            .set({ 
              creditBalance: Math.max(0, user.creditBalance - creditsToCharge),
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
            
          // Log usage for analytics and billing
          await storage.createUsageLog({
            userId,
            messageId: assistantMessage.id,
            modelId,
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            imageCount: isMultimodalRequest ? 1 : 0,
            creditsUsed: creditsToCharge,
            metadata: { 
              type: 'chat_completion',
              conversationId
            }
          });
          
          console.log(`Credits charged for message: ${creditsToCharge}, balance now: ${user.creditBalance - creditsToCharge}`);
        } else {
          console.log(`No credits charged - ${modelId} is a free model`);
        }
      } catch (streamError) {
        console.error('Error in streaming response:', streamError);
        res.write(`\n\nError: ${streamError instanceof Error ? streamError.message : String(streamError)}`);
        res.end();
        
        // Update the message with error indication
        await db.update(messages)
          .set({ 
            content: fullResponse + `\n\nError: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
            updatedAt: new Date()
          })
          .where(eq(messages.id, assistantMessage.id));
      }
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Error processing message" });
    }
  });
  
  // Delete a conversation
  app.delete('/api/conversations/:id', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      // Verify this conversation belongs to the user
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      });
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Delete all messages in the conversation
      await db.delete(messages)
        .where(eq(messages.conversationId, conversationId));
      
      // Delete the conversation
      await db.delete(conversations)
        .where(eq(conversations.id, conversationId));
      
      res.json({ message: "Conversation deleted successfully" });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Error deleting conversation" });
    }
  });
  
  // Search conversations by title or content
  app.get('/api/conversations/search', isAuthenticated, async (req, res) => {
    try {
      const query = req.query.q as string || '';
      const userId = req.user!.id;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      // First, find conversations with matching titles
      const matchingConversations = await db.query.conversations.findMany({
        where: and(
          eq(conversations.userId, userId),
          like(conversations.title, `%${query}%`)
        ),
        orderBy: desc(conversations.updatedAt)
      });
      
      // Then, find conversations with matching message content
      const matchingMessages = await db.query.messages.findMany({
        where: and(
          like(messages.content, `%${query}%`),
          // Need to filter by user's conversations
          sql`${messages.conversationId} IN (
            SELECT id FROM ${conversations} 
            WHERE ${conversations.userId} = ${userId}
          )`
        ),
        columns: {
          conversationId: true
        },
        orderBy: desc(messages.createdAt)
      });
      
      // Extract unique conversation IDs from matching messages
      const matchingMessageConversationIds = [...new Set(matchingMessages.map(m => m.conversationId))];
      
      // Fetch those conversations
      const conversationsFromMessages = await db.query.conversations.findMany({
        where: and(
          eq(conversations.userId, userId),
          sql`${conversations.id} IN (${matchingMessageConversationIds.join(',')})`
        ),
        orderBy: desc(conversations.updatedAt)
      });
      
      // Combine results (ensuring no duplicates)
      const allConversationIds = new Set(matchingConversations.map(c => c.id));
      const uniqueResults = [...matchingConversations];
      
      for (const conv of conversationsFromMessages) {
        if (!allConversationIds.has(conv.id)) {
          uniqueResults.push(conv);
          allConversationIds.add(conv.id);
        }
      }
      
      res.json(uniqueResults);
    } catch (error) {
      console.error("Error searching conversations:", error);
      res.status(500).json({ message: "Error searching conversations" });
    }
  });
  
  // Get user's usage statistics by day
  app.get('/api/user/usage', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 30; // Default to 30 days
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get usage logs
      const logs = await db.query.usageLogs.findMany({
        where: and(
          eq(usageLogs.userId, userId),
          sql`${usageLogs.createdAt} >= ${startDate} AND ${usageLogs.createdAt} <= ${endDate}`
        ),
        orderBy: asc(usageLogs.createdAt)
      });
      
      // Aggregate by day and model
      const dailyUsage: Record<string, Record<string, { tokens: number, credits: number, requests: number }>> = {};
      const modelTotals: Record<string, { tokens: number, credits: number, requests: number }> = {};
      
      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      
      logs.forEach(log => {
        const day = formatDate(log.createdAt);
        const model = log.modelId;
        const totalTokens = (log.promptTokens || 0) + (log.completionTokens || 0);
        
        // Initialize structures if needed
        if (!dailyUsage[day]) {
          dailyUsage[day] = {};
        }
        
        if (!dailyUsage[day][model]) {
          dailyUsage[day][model] = { tokens: 0, credits: 0, requests: 0 };
        }
        
        if (!modelTotals[model]) {
          modelTotals[model] = { tokens: 0, credits: 0, requests: 0 };
        }
        
        // Update daily usage
        dailyUsage[day][model].tokens += totalTokens;
        dailyUsage[day][model].credits += log.creditsUsed;
        dailyUsage[day][model].requests += 1;
        
        // Update model totals
        modelTotals[model].tokens += totalTokens;
        modelTotals[model].credits += log.creditsUsed;
        modelTotals[model].requests += 1;
      });
      
      // Format for response
      const dailyData = Object.entries(dailyUsage).map(([date, models]) => ({
        date,
        models: Object.entries(models).map(([model, stats]) => ({
          model,
          ...stats
        }))
      }));
      
      const modelData = Object.entries(modelTotals).map(([model, stats]) => ({
        model,
        ...stats
      }));
      
      // Sort by date
      dailyData.sort((a, b) => a.date.localeCompare(b.date));
      
      // Sort models by credit usage (descending)
      modelData.sort((a, b) => b.credits - a.credits);
      
      res.json({
        dailyUsage: dailyData,
        modelTotals: modelData
      });
    } catch (error) {
      console.error("Error fetching usage statistics:", error);
      res.status(500).json({ message: "Error fetching usage statistics" });
    }
  });
  
  // Get daily active users for admin dashboard (protected)
  app.get('/api/admin/metrics/dau', isAuthenticated, async (req, res) => {
    try {
      const user = req.user!;
      // Check if user is admin (hardcoded for now)
      const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
      
      if (!adminEmails.includes(user.email)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const days = parseInt(req.query.days as string) || 30; // Default to 30 days
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Query for daily active users
      const dailyUsers = await db.select({
        date: sql<string>`date_trunc('day', ${messages.createdAt})::text`,
        uniqueUsers: sql<number>`count(distinct ${messages.conversationId})`
      })
      .from(messages)
      .where(
        sql`${messages.createdAt} >= ${startDate} AND ${messages.createdAt} <= ${endDate}`
      )
      .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
      .orderBy(sql`date_trunc('day', ${messages.createdAt})`);
      
      res.json(dailyUsers);
    } catch (error) {
      console.error("Error fetching daily active users:", error);
      res.status(500).json({ message: "Error fetching metrics" });
    }
  });
  
  // Create HTTP server
  const server = createServer(app);
  
  // Initialize WebSocket server for chat
  const wss = new WebSocketServer({ noServer: true });
  
  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      console.log('Received message:', message.toString());
      
      // Echo back for now (actual implementation will be more complex)
      ws.send(JSON.stringify({ type: 'echo', data: message.toString() }));
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
  
  // Upgrade HTTP connections to WebSocket when requested
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
  
  return server;
}