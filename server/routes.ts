import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";
import passport from "passport";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import fs from 'fs';
import path from 'path';
import {
  isPayPalConfigValid,
  CREDIT_PACKAGES,
  calculateCreditsToCharge,
  createPayPalOrder,
  createCustomAmountPayPalOrder,
  capturePayPalOrder,
  verifyPayPalWebhook,
  CREDIT_VALUE_USD
} from "./paypal";
import { registerDocumentRoutes } from "./documentRoutes";
import { registerContentRoutes } from "./contentRoutes";
import { findSimilarChunks, formatContextForPrompt } from "./documentProcessor";
import { 
  ErrorCategory, 
  ApiError, 
  parseOpenRouterError, 
  handleInternalError, 
  sendErrorResponse,
  getUserMessageForCategory
} from "./errorHandler";

/**
 * Generates and saves a conversation title based on the first user message
 * Uses an AI model to generate a concise, meaningful title
 */
async function generateAndSaveConversationTitle(conversationId: number): Promise<void> {
  try {
    // Get the conversation to check if title generation is needed
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || conversation.title !== "New Conversation") {
      // Skip if conversation doesn't exist or already has a custom title
      return;
    }
    
    // Get the first user message
    const firstUserMessage = await storage.getFirstUserMessage(conversationId);
    if (!firstUserMessage) {
      // No user message found, can't generate a title
      return;
    }
    
    const firstUserMessageContent = firstUserMessage.content;
    
    // Fetch OpenRouter models
    let openRouterModels;
    try {
      // Get the model list from the internal OpenRouter models endpoint
      const modelsUrl = "https://openrouter.ai/api/v1/models";
      const modelsResponse = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      });
      
      if (!modelsResponse.ok) {
        console.error(`Failed to fetch models from OpenRouter: ${modelsResponse.status} ${modelsResponse.statusText}`);
        return;
      }
      
      const modelsData = await modelsResponse.json();
      openRouterModels = modelsData.data || [];
      
      if (!openRouterModels || !openRouterModels.length) {
        console.warn("No models returned from OpenRouter API");
        return;
      }
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      return;
    }
    
    // Filter for free models
    const freeModels = openRouterModels.filter(model => model.isFree === true);
    
    if (!freeModels.length) {
      console.warn("No free models available for title generation.");
      return;
    }
    
    // Define preferred models for title generation
    const preferredTitleModels = [
      'qwen/qwen-2.5-vl-3b-instruct',
      'allenai/molmo-7b-d',
      'meta-llama/llama-4-maverick-17b-instruct-128e',
      'meta-llama/llama-4-scout-17b-instruct-16e',
      'google/gemini-2.5-pro-experimental',
    ];
    
    // Find the first preferred model that's available for free
    let selectedModelId = null;
    for (const preferredModelId of preferredTitleModels) {
      if (freeModels.some(model => model.id === preferredModelId)) {
        selectedModelId = preferredModelId;
        break;
      }
    }
    
    // If no preferred model is found, use the first free model as fallback
    if (!selectedModelId && freeModels.length > 0) {
      selectedModelId = freeModels[0].id;
    }
    
    if (!selectedModelId) {
      console.warn("Could not select a suitable model for title generation.");
      return;
    }
    
    // Call OpenRouter to generate a title
    try {
      const titlePromptMessages = [
        {
          "role": "user", 
          "content": `Based on the following user message, suggest a concise and relevant conversation title (max 7 words):\n\nUser Message: '''${firstUserMessageContent}'''\n\nTitle:`
        }
      ];
      
      const payload = {
        model: selectedModelId,
        messages: titlePromptMessages,
        temperature: 0.5,
        max_tokens: 20
      };
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error for title generation: ${response.status} ${response.statusText}`, errorText);
        return;
      }
      
      // Process the API response
      try {
        const data = await response.json();
        let generatedTitle = data.choices?.[0]?.message?.content;
        
        if (generatedTitle) {
          // Clean up the title
          generatedTitle = generatedTitle.trim().replace(/^["']|["']$/g, '');
          
          if (generatedTitle) {
            // Update the conversation title in storage
            await storage.updateConversationTitle(conversationId, generatedTitle);
            console.log(`AI generated and saved title for conversation ${conversationId}: "${generatedTitle}"`);
          }
        }
      } catch (parseError) {
        console.error("Error parsing title generation response:", parseError);
      }
    } catch (apiError) {
      console.error("Error calling OpenRouter API for title generation:", apiError);
    }
  } catch (error) {
    console.error("Error generating conversation title:", error);
    // Don't throw - this is a non-critical operation
  }
}

type ModelType = "reasoning" | "search" | "multimodal";
import 'express-session';

// Type for authenticated user in Request
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

// Middleware to check if user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // Development mode: allow testing with a query parameter for a specific user ID
  // WARNING: This should only be enabled in development environments
  if (process.env.NODE_ENV !== 'production' && req.query.userId) {
    const userId = parseInt(req.query.userId as string, 10);
    if (!isNaN(userId)) {
      // Fetch user data from database
      storage.getUserById(userId).then(user => {
        if (user) {
          // Manually set user for this request
          req.user = {
            id: user.id,
            googleId: user.googleId,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            creditBalance: user.creditBalance,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          };
          return next();
        } else {
          res.status(401).json({ message: "User not found" });
        }
      }).catch(err => {
        console.error("Error fetching user for development authentication:", err);
        res.status(500).json({ message: "Server error during development authentication" });
      });
      return;
    }
  }
  
  res.status(401).json({ message: "Unauthorized" });
};

// Define special types for multimodal API integration
type MultimodalContentItem = 
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// This represents the format expected by the Groq API for multimodal messages
interface MultimodalMessage {
  role: string;
  content: MultimodalContentItem[];
}

// Union type for messages that can be either text-only or multimodal
type ApiMessage = 
  | { role: string; content: string }
  | MultimodalMessage;

// Extend SessionData interface for express-session
declare module 'express-session' {
  interface SessionData {
    userConversations?: number[]; // Array of conversation IDs
  }
}

// Define API keys with proper validation
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// Validate API keys on startup
const isPerplexityKeyValid = PERPLEXITY_API_KEY && PERPLEXITY_API_KEY.length > 10;
const isGroqKeyValid = GROQ_API_KEY && GROQ_API_KEY.length > 10;
const isOpenRouterKeyValid = OPENROUTER_API_KEY && OPENROUTER_API_KEY.length > 10;

console.log("API Key Status:");
console.log(`- Perplexity API Key: ${isPerplexityKeyValid ? "Valid" : "Invalid or Missing"}`);
console.log(`- Groq API Key: ${isGroqKeyValid ? "Valid" : "Invalid or Missing"}`);
console.log(`- OpenRouter API Key: ${isOpenRouterKeyValid ? "Valid" : "Invalid or Missing"}`);

// Function to validate API key at request time
function isValidApiKey(key: string | undefined | null): boolean {
  if (!key) return false;
  if (typeof key !== 'string') return false;
  
  // Enhanced API key validation for better debugging
  const isLongEnough = key.length > 10;
  const hasValidPrefix = 
    (key.startsWith('grk_') && key.length >= 50) || // Groq API key prefix
    (key.startsWith('pplx-') && key.length >= 40);  // Perplexity API key prefix
  
  // Log detailed validation result for debugging
  if (!isLongEnough) {
    console.warn(`API key validation failed: Key length less than 10 (actual: ${key.length})`);
  } else if (!hasValidPrefix) {
    console.warn(`API key validation warning: Key doesn't have a recognized prefix`);
  }
  
  // For production, we could be stricter, but for now just check length
  return isLongEnough;
}

// Load model pricing data from models.json
const loadModelPricing = () => {
  try {
    const modelsData = fs.readFileSync(path.join(process.cwd(), 'models.json'), 'utf8');
    return JSON.parse(modelsData);
  } catch (error) {
    console.error('Error loading models.json:', error);
    return [];
  }
};

// Cache the model pricing data
const modelPricingData = loadModelPricing();

// Function to get model pricing by model ID (for OpenRouter models)
const getModelPricing = (modelId: string) => {
  const model = modelPricingData.find((m: any) => m.id === modelId);
  if (model) {
    return {
      promptPrice: parseFloat(model.pricing.prompt) || 0,
      completionPrice: parseFloat(model.pricing.completion) || 0
    };
  }
  // Default pricing if model not found
  return {
    promptPrice: 0.000001, // Default to $0.000001 per token if unknown
    completionPrice: 0.000002 // Default to $0.000002 per token if unknown
  };
};

// Default model pricing for our standard models
const DEFAULT_MODEL_PRICING = {
  reasoning: {
    promptPrice: 0.0000005, // $0.0000005 per token
    completionPrice: 0.0000015 // $0.0000015 per token
  },
  search: {
    promptPrice: 0.000001, // $0.000001 per token
    completionPrice: 0.000002 // $0.000002 per token
  },
  multimodal: {
    promptPrice: 0.000001, // $0.000001 per token
    completionPrice: 0.000002, // $0.000002 per token
    imagePrice: 0.002 // $0.002 per image
  }
};

// Define model configurations
const MODEL_CONFIGS = {
  reasoning: {
    apiProvider: "groq",
    modelName: "deepseek-r1-distill-llama-70b",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: GROQ_API_KEY,
    pricing: DEFAULT_MODEL_PRICING.reasoning
  },
  search: {
    // Using Perplexity's Sonar Pro model via OpenRouter for search
    apiProvider: "openrouter",
    modelName: "perplexity/sonar-pro",  // Perplexity's best search model
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: OPENROUTER_API_KEY,
    pricing: DEFAULT_MODEL_PRICING.search
  },
  multimodal: {
    apiProvider: "openrouter",
    modelName: "openai/gpt-4o", // OpenAI's multimodal model
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: OPENROUTER_API_KEY, 
    pricing: DEFAULT_MODEL_PRICING.multimodal
  }
};

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
          preset5ModelId: true
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
        preset5: userPresets.preset5ModelId
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
        preset5: z.string().nullable()
      });
      
      const validationResult = presetsSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid preset data", 
          errors: validationResult.error.errors 
        });
      }
      
      const userId = req.user!.id;
      const { preset1, preset2, preset3, preset4, preset5 } = validationResult.data;
      
      // Create a transformed object mapping frontend keys to database column names
      const dbPresets = {
        preset1ModelId: preset1,
        preset2ModelId: preset2,
        preset3ModelId: preset3,
        preset4ModelId: preset4,
        preset5ModelId: preset5,
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
        preset5
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
  app.get("/api/debug/keys", (req, res) => {
    // Safe way to check if keys exist without exposing them
    const perplexityKeyStatus = PERPLEXITY_API_KEY ? "exists (length: " + PERPLEXITY_API_KEY.length + ")" : "missing";
    const groqKeyStatus = GROQ_API_KEY ? "exists (length: " + GROQ_API_KEY.length + ")" : "missing";
    
    // Get all environment variables with API or KEY in the name
    const apiEnvVars = Object.keys(process.env).filter(key => 
      key.includes("API") || key.includes("KEY") || key.includes("GROQ") || key.includes("PERPLEXITY")
    );
    
    // Include deployment-specific information
    const isDeployed = process.env.REPL_ID && process.env.REPL_OWNER;
    const deploymentInfo = {
      isDeployed,
      replId: process.env.REPL_ID || "Not available",
      replSlug: process.env.REPL_SLUG || "Not available",
      nodeEnv: process.env.NODE_ENV || "Not set",
      isProduction: process.env.NODE_ENV === "production"
    };
    
    console.log(`Debug keys request from ${isDeployed ? 'deployed' : 'development'} environment`);
    console.log(`API Key statuses: Perplexity: ${perplexityKeyStatus}, Groq: ${groqKeyStatus}`);
    
    res.json({
      perplexityKey: perplexityKeyStatus,
      perplexityKeyValid: isValidApiKey(PERPLEXITY_API_KEY),
      groqKey: groqKeyStatus,
      groqKeyValid: isValidApiKey(GROQ_API_KEY),
      envVars: apiEnvVars,
      deployment: deploymentInfo
    });
  });
  
  // Test API connections without sending real messages
  // OpenRouter Models endpoint
  app.get("/api/openrouter/models", async (req, res) => {
    if (!isOpenRouterKeyValid) {
      sendErrorResponse(res, {
        status: 401,
        category: ErrorCategory.CONFIGURATION,
        message: "Valid OpenRouter API key is required",
        userMessage: "OpenRouter API key is missing or invalid. Please provide a valid API key in the application settings."
      });
      return;
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);
        const apiError = parseOpenRouterError(response.status, errorText);
        sendErrorResponse(res, apiError);
        return;
      }

      const data = await response.json();
      
      // Extract more information including pricing from each model for the frontend
      const models = data.data.map((model: any) => {
        // Properly determine if a model is free by checking all pricing properties
        const promptCost = model.pricing?.prompt;
        const completionCost = model.pricing?.completion;
        const requestCost = model.pricing?.request;
        
        const isPromptFree = promptCost === 0 || promptCost === null || promptCost === undefined || 
                            (typeof promptCost === 'string' && parseFloat(promptCost) === 0);
        const isCompletionFree = completionCost === 0 || completionCost === null || completionCost === undefined || 
                                (typeof completionCost === 'string' && parseFloat(completionCost) === 0);
        const isRequestFree = requestCost === 0 || requestCost === null || requestCost === undefined || 
                            (typeof requestCost === 'string' && parseFloat(requestCost) === 0);
        
        const isFree = isPromptFree && isCompletionFree && isRequestFree;
        
        return {
          id: model.id,
          name: model.name,
          pricing: model.pricing || null,
          context_length: model.context_length || null,
          isFree
        };
      });

      return res.json(models);
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      const apiError = handleInternalError(error, "OpenRouter models API");
      sendErrorResponse(res, apiError);
    }
  });

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
      } else if (provider === "openrouter") {
        apiUrl = "https://openrouter.ai/api/v1/models";
        apiKey = OPENROUTER_API_KEY;
        modelName = "models list";
      } else {
        return res.status(400).json({ error: "Invalid provider. Use 'groq', 'perplexity', or 'openrouter'." });
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
          model: "sonar-reasoning", // Using the correct Perplexity model name
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
        // Use our error handling system for more detailed error information
        const apiError = parseOpenRouterError(response.status, errorText);
        
        return res.status(response.status).json({
          error: `API returned ${response.status}`,
          category: apiError.category,
          message: apiError.userMessage,
          technicalDetails: apiError.message,
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
      
      // Use our error handling system for a better error response
      const apiError = handleInternalError(error, provider);
      
      return res.status(apiError.status).json({
        error: "Failed to test API connection",
        provider,
        category: apiError.category,
        message: apiError.userMessage,
        technicalDetails: apiError.message
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
  
  // PayPal integration routes
  
  // Get available credit packages
  app.get("/api/credits/packages", (req, res) => {
    res.json(CREDIT_PACKAGES);
  });
  
  // Admin route to credit a specific user with a one-time balance
  // This is for development/testing purposes
  app.post("/api/credits/admin-credit", async (req, res) => {
    try {
      const { email, amount } = req.body;
      
      // Validate the request
      if (!email || !amount) {
        return res.status(400).json({ message: "Email and amount are required" });
      }
      
      // Find the user by email
      const usersWithEmail = await db.select().from(users).where(eq(users.email, email));
      
      if (usersWithEmail.length === 0) {
        return res.status(404).json({ message: "User not found with email: " + email });
      }
      
      const user = usersWithEmail[0];
      console.log(`Found user with ID ${user.id} and email ${email}`);
      
      // Convert dollar amount to credits (10,000 credits = $1)
      const credits = Math.floor(parseFloat(amount.toString()) * 10000);
      
      // Update the user's balance
      const updatedUser = await storage.addUserCredits(user.id, credits);
      
      return res.json({ 
        message: `Successfully credited ${amount} dollars to ${email}`,
        newBalance: updatedUser.creditBalance / 10000
      });
    } catch (error) {
      console.error("Error adding admin credits:", error);
      return res.status(500).json({ 
        message: "Failed to add credits", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Create a PayPal order for purchasing credits
  app.post("/api/paypal/create-order", isAuthenticated, async (req, res) => {
    try {
      if (!isPayPalConfigValid) {
        return res.status(500).json({ message: "PayPal is not properly configured" });
      }
      
      const packageIdSchema = z.object({
        packageId: z.string()
      });
      
      const validationResult = packageIdSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid package ID", 
          errors: validationResult.error.errors 
        });
      }
      
      const { packageId } = validationResult.data;
      const orderId = await createPayPalOrder(packageId);
      
      res.json({ orderId });
    } catch (error) {
      console.error("Error creating PayPal order:", error);
      res.status(500).json({ 
        message: "Failed to create PayPal order", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Create a PayPal order for a custom amount
  app.post("/api/paypal/create-custom-order", isAuthenticated, async (req, res) => {
    try {
      if (!isPayPalConfigValid) {
        return res.status(500).json({ message: "PayPal is not properly configured" });
      }
      
      const customAmountSchema = z.object({
        amount: z.number().min(5) // Minimum $5.00
      });
      
      const validationResult = customAmountSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid amount. Minimum is $5.00", 
          errors: validationResult.error.errors 
        });
      }
      
      const { amount } = validationResult.data;
      const result = await createCustomAmountPayPalOrder(amount);
      
      res.json({ 
        orderId: result.orderId,
        credits: result.credits
      });
    } catch (error) {
      console.error("Error creating custom PayPal order:", error);
      res.status(500).json({ 
        message: "Failed to create custom PayPal order", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Capture a PayPal order and add credits to user account
  app.post("/api/paypal/capture-order", isAuthenticated, async (req, res) => {
    try {
      if (!isPayPalConfigValid) {
        return res.status(500).json({ message: "PayPal is not properly configured" });
      }
      
      const orderIdSchema = z.object({
        orderId: z.string()
      });
      
      const validationResult = orderIdSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid order ID", 
          errors: validationResult.error.errors 
        });
      }
      
      const { orderId } = validationResult.data;
      const captureResult = await capturePayPalOrder(orderId);
      
      if (!captureResult.success) {
        return res.status(400).json({ message: "Failed to capture order" });
      }
      
      // Add credits to user account if package was identified
      if (captureResult.credits) {
        const userId = req.user!.id;
        await storage.addUserCredits(userId, captureResult.credits);
        
        // Get updated user info
        const updatedUser = await storage.getUser(userId);
        
        return res.json({
          success: true,
          message: `Added ${captureResult.credits} credits to your account`,
          captureId: captureResult.captureId,
          newBalance: updatedUser?.creditBalance || 0
        });
      }
      
      res.json({
        success: true,
        message: "Payment completed but could not identify credit package",
        captureId: captureResult.captureId
      });
    } catch (error) {
      console.error("Error capturing PayPal order:", error);
      res.status(500).json({ 
        message: "Failed to capture PayPal order", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // PayPal webhook handler for backup payment verification
  app.post("/api/paypal/webhook", async (req, res) => {
    try {
      if (!isPayPalConfigValid) {
        return res.status(500).json({ message: "PayPal is not properly configured" });
      }
      
      const isValid = verifyPayPalWebhook(req.body, req.headers);
      
      if (!isValid) {
        console.warn("Invalid PayPal webhook signature");
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
      
      const eventType = req.body.event_type;
      
      // Process webhook event
      console.log(`Received PayPal webhook event: ${eventType}`);
      
      // We primarily process credits in the capture-order endpoint
      // This webhook serves as a backup for payment verification
      
      // Return 200 to acknowledge receipt
      return res.status(200).send();
    } catch (error) {
      console.error("Error processing PayPal webhook:", error);
      res.status(500).json({ 
        message: "Failed to process PayPal webhook", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // API routes
  app.get("/api/conversations", async (req, res) => {
    try {
      let conversations;
      
      // Check if user is authenticated
      if (req.isAuthenticated()) {
        // If user is authenticated, get their conversations from the database
        const userId = (req.user as Express.User).id;
        console.log(`Getting conversations for authenticated user ID: ${userId}`);
        conversations = await storage.getConversationsByUserId(userId);
        console.log(`Found ${conversations.length} conversations for user ${userId}`);
      } else {
        // For unauthenticated users, use session-based conversations
        // Initialize session user conversations if not exists
        if (!req.session.userConversations) {
          req.session.userConversations = [];
        }
        
        // Get all conversations
        const allConversations = await storage.getConversations();
        
        // If session has no conversations yet but there are conversations in storage,
        // restore them to the session (this helps with persistence)
        if (req.session.userConversations.length === 0 && allConversations.length > 0) {
          // Store conversation IDs with null userId in the session (these are anonymous conversations)
          req.session.userConversations = allConversations
            .filter(conv => conv.userId === null)
            .map(conv => conv.id);
          
          await new Promise<void>((resolve) => {
            req.session.save(() => resolve());
          });
          console.log("Restored anonymous conversations to session:", req.session.userConversations);
        }
        
        // Get all conversations and filter by user session if available
        conversations = req.session.userConversations.length > 0
          ? allConversations.filter(conv => req.session.userConversations?.includes(conv.id))
          : [];
        
        console.log(`Returning ${conversations.length} conversations for anonymous session`);
      }
      
      res.json(conversations);
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
      
      // Set userId if user is authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : null;
      
      // Create the conversation with the appropriate userId (null for anonymous)
      const conversation = await storage.createConversation({ 
        title, 
        userId
      });
      
      // For anonymous users, keep track of the conversation in the session
      if (!userId) {
        // Add conversation ID to user session
        req.session.userConversations.push(conversation.id);
        // Save session changes
        req.session.save();
        console.log(`Added conversation ${conversation.id} to anonymous session`);
      } else {
        console.log(`Created conversation ${conversation.id} for authenticated user ${userId}`);
      }
      
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
      
      // Check if user is authorized to access this conversation
      if (conversation.userId !== null) {
        // This is a registered user's conversation - check if it belongs to current user
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      } else {
        // This is an anonymous conversation - check if it's in the session
        if (!req.session.userConversations?.includes(id)) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      }
      
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      
      // Get the conversation first to check permissions
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user is authorized to access this conversation
      if (conversation.userId !== null) {
        // This is a registered user's conversation - check if it belongs to current user
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      } else {
        // This is an anonymous conversation - check if it's in the session
        if (!req.session.userConversations?.includes(conversationId)) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      }
      
      const messages = await storage.getMessagesByConversation(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });
  
  // Streaming endpoint for chat messages
  app.get("/api/conversations/:id/messages/stream", async (req, res) => {
    try {
      console.log('[STREAM HANDLER] Starting GET /stream request processing.');
      const conversationId = parseInt(req.params.id);
      
      // Get the conversation first to check permissions
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user is authorized to access this conversation
      if (conversation.userId !== null) {
        // This is a registered user's conversation - check if it belongs to current user
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      } else {
        // This is an anonymous conversation - check if it's in the session
        if (!req.session.userConversations?.includes(conversationId)) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      }
      
      console.log('[STREAM HANDLER] Permissions checked, proceeding.');
      
      const { content, modelType = "reasoning", modelId = "", image } = req.query as { 
        content?: string;
        modelType?: string;
        modelId?: string;
        image?: string;
      };
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }
      

      
      // If an image is present, don't allow streaming (since we need to use multimodal model)
      if (image) {
        return res.status(400).json({ 
          message: "Streaming is not supported for image inputs. Please use the standard API endpoint."
        });
      }
      
      // Get the model configuration based on the requested model type
      const modelConfig = MODEL_CONFIGS[modelType] || MODEL_CONFIGS.reasoning; // Allow any model type for streaming
      
      // Always use streaming for this endpoint
      const shouldStream = true;

      // Create user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content,
        image: image || undefined, // Store the image data in the message
        citations: null,
      });

      // Get previous messages to build the context
      const previousMessages = await storage.getMessagesByConversation(conversationId);
      
      // Prepare messages for API
      // Filter out any invalid messages and ensure proper role alternation
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      // Sort messages by ID to ensure correct sequence
      filteredMessages.sort((a, b) => a.id - b.id);
      
      // Check for relevant documents and get RAG context
      let ragContext = '';
      try {
        const { chunks, documents } = await findSimilarChunks(content, conversationId);
        if (chunks.length > 0) {
          ragContext = formatContextForPrompt(chunks, documents);
          console.log(`Added RAG context from ${chunks.length} document chunks`);
        }
      } catch (error) {
        console.error("Error fetching RAG context:", error);
        // Continue without RAG context if there's an error
      }
      
      // COMMENTED OUT: Original, detailed system prompt
      /* 
      let systemContent = `You are GloriaMundo, an AI assistant powered by ${modelConfig.apiProvider}'s ${modelConfig.modelName} model. Your purpose is to provide accurate, thorough, and helpful information in response to user queries.

Core Values:
- Accuracy: Provide factually correct information based on the most reliable sources available.
- Comprehensiveness: Cover relevant aspects of the topic to give a complete picture.
- Objectivity: Present multiple perspectives on topics where different viewpoints exist.
- Clarity: Explain complex concepts in clear, accessible language.
- Utility: Focus on providing information that is practically useful to the user.

Response Guidelines:
- Be concise yet thorough in your explanations.
- Acknowledge limitations and uncertainties in current knowledge when they exist.
- Provide context to help users understand the broader significance of information.
- When appropriate, suggest resources for further exploration of the topic.
- Organize information in a structured, logical manner.`;

      // Add reasoning-specific instructions
      systemContent += `\n\nReasoning Approach:
- Break down complex concepts into understandable parts
- Use logical reasoning and structured thinking to explore topics deeply
- Connect ideas across different domains when relevant
- Present multiple perspectives on complex issues
- Identify underlying assumptions and logical implications
- Clarify ambiguities and potential misunderstandings`;

      systemContent += `\n\nTone:
Your communication style should be:
- Clear and concise
- Neutral and objective
- Professional yet approachable
- Focused on accuracy and completeness
- Free from unnecessary embellishments
- Precise in the use of terminology

Remember that your purpose is to provide accurate, helpful information that addresses the user's query directly.

Format your responses using markdown for better readability and organization.`;
      */
      
      // Initialize the messages array
      const messages: ApiMessage[] = [];
      
      // Only include system message if RAG context is available
      let systemContent = "";
      if (ragContext) {
        systemContent = `You are an AI assistant responding to a user query. Use the following document context provided below to answer the query. Prioritize information found in the context. If the context does not contain the answer, state that.\n\nRelevant Document Context:\n${ragContext}\n\nUse the above document information to answer the query.`;
        
        messages.push({
          role: "system",
          content: systemContent,
        });
      }
      
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
          content: content as string
        });
      }

      // Check if we have the required API key
      if (!isValidApiKey(modelConfig.apiKey)) {
        console.error(`Invalid or missing API key for ${modelType} model (provider: ${modelConfig.apiProvider})`);
        return res.status(500).json({ 
          message: `The ${modelType} model is not available because the API key is not configured.`
        });
      }

      // Call AI API
      try {
        // Log request information
        console.log(`Streaming ${modelType} API (${modelConfig.apiProvider}) with:`, {
          model: modelConfig.modelName,
          temperature: 0.2,
          top_p: 0.9,
          stream: true,
          messagesCount: messages.length
        });

        // Determine the correct model parameter to use
        // For OpenRouter, we MUST use the exact modelId passed from the client
        let modelParam = modelConfig.modelName;
        
        // For OpenRouter, ensure we use the correct model ID
        if (modelConfig.apiProvider === "openrouter" && modelId) {
          modelParam = modelId;
          console.log(`Streaming OpenRouter request using model ID: ${modelId}`);
        }
        
        // Create a cleaned version of the messages array for the payload
        // This is especially important for OpenRouter to ensure proper message format
        const cleanMessages = modelConfig.apiProvider === "openrouter" 
          ? messages.map(msg => {
              if (typeof msg.content === 'string') {
                return {
                  role: msg.role,
                  content: msg.content
                };
              }
              // Handle multimodal content (array of content items)
              return msg;
            })
          : messages;
        
        if (modelConfig.apiProvider === "openrouter") {
          console.log('Created clean messages for OpenRouter streaming API');
        }
        
        console.log('[STREAM HANDLER] Preparing API payload...');
        const payload = {
          model: modelParam,
          messages: cleanMessages,
          temperature: 0.2,
          top_p: 0.9,
          stream: true
        };
        
        // Set up Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Make the API request
        console.log('[STREAM HANDLER] Initiating fetch to OpenRouter...');
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
          console.error(`[STREAM HANDLER] ${modelConfig.apiProvider} API streaming error: ${errorText}`);
          console.error(`[STREAM HANDLER] Response status: ${response.status}, headers:`, response.headers);
          
          // Parse the error using our enhanced error handler
          const apiError = parseOpenRouterError(response.status, errorText);
          
          // Log the structured error information
          console.error(`[STREAM HANDLER] Parsed error category: ${apiError.category}, details:`, apiError.details);
          
          // Throw a more detailed error message
          throw new Error(
            `${modelConfig.apiProvider} API error: ${apiError.message} (Status: ${response.status}, Category: ${apiError.category})`
          );
        }
        
        console.log(`[STREAM HANDLER] ${modelConfig.apiProvider} response successful: ${response.status} ${response.statusText}`);

        // Set headers for SSE
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Directly pipe the raw OpenRouter response stream to the client response object 'res'
        console.log('[STREAM HANDLER] Stream response received successfully, piping to client...');
        if (response.body) {
          // Safe casting to avoid TypeScript errors with pipe method
          const nodeReadable = response.body as unknown as NodeJS.ReadableStream;
          nodeReadable.pipe(res);
          console.log('[STREAM HANDLER] Stream piping initiated');
        } else {
          throw new Error('Response body is null or undefined');
        }

        // Add a return statement immediately after piping, if not already the end of the function block
        return;
        
        // Update the conversation title if needed
        const conversation = await storage.getConversation(conversationId);
        if (conversation && conversation.title === "New Conversation") {
          // Generate an intelligent title based on the content
          let generatedTitle = "";
          
          // Extract main topic from first user message
          if (!content || content.length === 0) {
            // Handle empty content case
            generatedTitle = image ? "Image Analysis" : "New Conversation";
          } else if (content.length <= 25) {
            // If message is short, use it directly
            generatedTitle = content as string;
          } else {
            // Try to extract an intelligent title by keeping key phrases
            // First, try to extract a question
            const questionMatch = (content as string).match(/^(What|How|Why|When|Where|Which|Who|Can|Could|Should|Is|Are).+?\?/i);
            if (questionMatch && questionMatch[0].length < 50) {
              generatedTitle = questionMatch[0];
            } else {
              // Extract first sentence or meaningful chunk
              const sentenceEnd = (content as string).indexOf('.');
              const firstChunk = sentenceEnd > 0 && sentenceEnd < 40 
                ? (content as string).substring(0, sentenceEnd + 1) 
                : (content as string).substring(0, Math.min((content as string).length, 40));
              
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
        
        res.end();
      } catch (error) {
        // Create a detailed error message for the client using our error categorization system
        let errorMessage = "Failed to process streaming response";
        
        if (error instanceof Error) {
          console.error(`[STREAM HANDLER] Error in streaming response:`, error.message);
          console.error(`[STREAM HANDLER] Error stack trace:`, error.stack);
          
          // Log more details about the error context
          console.error(`[STREAM HANDLER] Error context: modelType=${modelType}, conversationId=${conversationId}`);
          
          let apiError: ApiError;
          
          if (error.message.includes("API error:")) {
            // This is a pre-categorized error from our error handler
            const errorText = error.message;
            // Extract category from error message if available
            const categoryMatch = errorText.match(/Category:\s+(\w+)/);
            const category = categoryMatch ? categoryMatch[1] as ErrorCategory : ErrorCategory.UNKNOWN;
            
            console.log(`[STREAM HANDLER] Parsed error category: ${category}`);
            // Get user-friendly message based on category
            errorMessage = getUserMessageForCategory(category, modelType);
            console.log(`[STREAM HANDLER] User-friendly error message: ${errorMessage}`);
          } else if (error.message.includes("Failed to get reader")) {
            console.log(`[STREAM HANDLER] Reader error detected`);
            apiError = {
              status: 500,
              category: ErrorCategory.INTERNAL_SERVER,
              message: "Failed to get reader from response",
              userMessage: "Server could not process the streaming response"
            };
            errorMessage = apiError.userMessage;
          } else {
            // Use handleInternalError to categorize other types of errors
            console.log(`[STREAM HANDLER] Uncategorized error, using handleInternalError()`);
            apiError = handleInternalError(error, modelConfig.apiProvider);
            errorMessage = apiError.userMessage;
            console.log(`[STREAM HANDLER] Categorized as: ${apiError.category}`);
          }
        } else {
          console.error(`[STREAM HANDLER] Unknown error in streaming response (not an Error instance):`, error);
          // Handle unknown errors
          const apiError = {
            status: 500,
            category: ErrorCategory.UNKNOWN,
            message: "Unknown error in streaming response",
            userMessage: getUserMessageForCategory(ErrorCategory.UNKNOWN, modelType)
          };
          errorMessage = apiError.userMessage;
          console.log(`[STREAM HANDLER] Using generic error message: ${errorMessage}`);
        }
        
        // Send the error event to the client
        console.log(`[STREAM HANDLER] Sending error event to client: "${errorMessage}"`);
        try {
          res.write(`data: ${JSON.stringify({ 
            type: "error", 
            message: errorMessage,
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          res.end();
          console.log(`[STREAM HANDLER] Error response successfully sent`);
        } catch (writeError) {
          console.error(`[STREAM HANDLER] Failed to write error response:`, writeError);
        }
      }
    } catch (error) {
      console.error('[STREAM HANDLER] Outer error handler caught exception:', error);
      // Provide more detailed error information for debugging
      const errorDetail = error instanceof Error ? error.message : String(error);
      console.error(`[STREAM HANDLER] Error details: ${errorDetail}`);
      
      // Try to send a properly formatted error response
      try {
        res.status(500).json({
          message: "Failed to process streaming message",
          error: errorDetail,
          timestamp: new Date().toISOString()
        });
      } catch (responseError) {
        // In case response has already been sent/ended
        console.error('[STREAM HANDLER] Could not send error response:', responseError);
      }
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      let { content = "", modelType = "reasoning", modelId = "", image, documentContext = null } = req.body;
      
      // Ensure content is a string (even if empty)
      content = content || "";
      
      if (!content && !image) {
        return res.status(400).json({ message: "Message content or image is required" });
      }
      
      // Get user from session
      const user = req.user as Express.User;
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Retrieve user credit balance
      const userDetails = await storage.getUser(user.id);
      if (!userDetails) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user has credits
      if (userDetails.creditBalance <= 0) {
        return res.status(402).json({ 
          message: "Insufficient credits. Please purchase more credits to continue.",
          error: "INSUFFICIENT_CREDITS"
        });
      }
      
      // If an image is present, force the model type to multimodal
      if (image) {
        console.log("Image detected, forcing model type to multimodal");
        modelType = "multimodal";
      }
      
      // Check if we're using OpenRouter (custom modelId is provided)
      // Also validate that modelId is not the placeholder 'not set' value
      if (modelId === 'not set') {
        console.error("Invalid modelId received: 'not set'");
        modelId = ""; // Reset to empty string instead of using the placeholder value
      }
      
      // Additional validation: If modelType is 'multimodal' but no valid modelId is provided
      // We need to ensure multimodal models always have a proper modelId
      if (modelType === 'multimodal' && (!modelId || modelId === "")) {
        console.log("Multimodal model selected but no specific modelId provided. Using default multimodal model.");
        // Use a default multimodal model from OpenRouter
        modelId = "openai/gpt-4-vision-preview";
      }
      
      const isOpenRouter = modelId && modelId !== "" && isOpenRouterKeyValid;
      
      // For OpenRouter, we'll use custom configurations
      let modelConfig;
      
      if (isOpenRouter) {
        // Use OpenRouter configuration
        modelConfig = {
          apiProvider: "openrouter",
          modelName: modelId, // Use the specific model ID from OpenRouter
          apiUrl: "https://openrouter.ai/api/v1/chat/completions",
          apiKey: OPENROUTER_API_KEY
        };
        console.log(`Using OpenRouter with model: ${modelId}`);
      } else {
        // Use standard model configurations
        modelConfig = MODEL_CONFIGS[modelType as keyof typeof MODEL_CONFIGS] || MODEL_CONFIGS.reasoning;
      }
      
      // We've removed streaming functionality entirely
      // This endpoint is for non-streaming requests only

      // Create user message
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content: content || "", // Ensure content is never undefined
        image: image || undefined, // Store the image data in the message
        citations: null,
      });

      // Get previous messages to build the context
      const previousMessages = await storage.getMessagesByConversation(conversationId);
      
      // Prepare messages for API
      // Filter out any invalid messages and ensure proper role alternation
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      // Sort messages by ID to ensure correct sequence
      filteredMessages.sort((a, b) => a.id - b.id);
      
      // Check for relevant documents and get RAG context if not already provided by the client
      let ragContext = documentContext || '';
      if (!ragContext) {
        try {
          const { chunks, documents } = await findSimilarChunks(content, conversationId);
          if (chunks.length > 0) {
            ragContext = formatContextForPrompt(chunks, documents);
            console.log(`Added RAG context from ${chunks.length} document chunks`);
          }
        } catch (error) {
          console.error("Error fetching RAG context:", error);
          // Continue without RAG context if there's an error
        }
      } else {
        console.log("Using document context provided by client");
      }

      // COMMENTED OUT: Original, detailed system prompt
      /*
      let systemContent = `You are GloriaMundo, an AI assistant powered by ${modelConfig.apiProvider}'s ${modelConfig.modelName} model. Your purpose is to provide accurate, thorough, and helpful information in response to user queries.

Core Values:
- Accuracy: Provide factually correct information based on the most reliable sources available.
- Comprehensiveness: Cover relevant aspects of the topic to give a complete picture.
- Objectivity: Present multiple perspectives on topics where different viewpoints exist.
- Clarity: Explain complex concepts in clear, accessible language.
- Utility: Focus on providing information that is practically useful to the user.

Response Guidelines:
- Be concise yet thorough in your explanations.
- Acknowledge limitations and uncertainties in current knowledge when they exist.
- Provide context to help users understand the broader significance of information.
- When appropriate, suggest resources for further exploration of the topic.
- Organize information in a structured, logical manner.`;

      // Add model-specific instructions
      if (modelType === "search") {
        systemContent += `\n\nSearch Behavior:
- Search for the most current and accurate information related to the query
- Present a comprehensive overview of the topic from reliable sources
- When multiple perspectives exist, present the different viewpoints objectively
- Include relevant statistics, research findings, or expert opinions when available
- Provide citations or sources for users to explore topics further`;
      } else if (modelType === "multimodal") {
        systemContent += `\n\nMultimodal Capabilities:
- When responding to queries that would benefit from visual examples, indicate where images would be helpful
- Describe visual concepts clearly and precisely when they are relevant to the query
- For instructions that involve visual steps, structure your response in a clear, step-by-step format
- Explain complex visual concepts in accessible language`;
      } else {
        systemContent += `\n\nReasoning Approach:
- Break down complex concepts into understandable parts
- Use logical reasoning and structured thinking to explore topics deeply
- Connect ideas across different domains when relevant
- Present multiple perspectives on complex issues
- Identify underlying assumptions and logical implications
- Clarify ambiguities and potential misunderstandings`;
      }

      systemContent += `\n\nTone:
Your communication style should be:
- Clear and concise
- Neutral and objective
- Professional yet approachable
- Focused on accuracy and completeness
- Free from unnecessary embellishments
- Precise in the use of terminology

Remember that your purpose is to provide accurate, helpful information that addresses the user's query directly.

Format your responses using markdown for better readability and organization.`;
      */

      // Initialize the messages array with proper typing for both text and multimodal messages
      const messages: ApiMessage[] = [];
      
      // Only include system message if RAG context is available
      let systemContent = "";
      if (ragContext) {
        // Use minimal system prompt to focus on RAG context
        systemContent = `You are an AI assistant responding to a user query. Use the following document context provided below to answer the query. Prioritize information found in the context. If the context does not contain the answer, state that.\n\nRelevant Document Context:\n${ragContext}\n\nUse the above document information to answer the query.`;
        
        // Only add system message if we're not using images with multimodal model
        // Groq's llama-3.2-90b-vision-preview doesn't support system messages with images
        if (!(modelType === "multimodal" && image)) {
          messages.push({
            role: "system",
            content: systemContent,
          });
        }
      }
      
      // Special handling for Perplexity's search model which requires strict user/assistant alternation
      if (modelType === "search") {
        // For search model, we need to be extra careful with message ordering
        // After system message, messages must strictly alternate between user and assistant
        
        // Get only the latest user message if no previous assistant response exists
        if (filteredMessages.length <= 1) {
          // If this is the first message, just include it (about to be added below)
          // Don't add anything from history
        } else {
          // Include the most recent complete exchange (user + assistant) if available
          const latestMessages = filteredMessages.slice(-2);
          if (latestMessages.length === 2 && 
              latestMessages[0].role === "user" && 
              latestMessages[1].role === "assistant") {
            messages.push({
              role: "user",
              content: latestMessages[0].content
            });
            messages.push({
              role: "assistant",
              content: latestMessages[1].content
            });
          }
        }
      } else {
        // For non-search models, use the standard alternating approach
        let lastRole = "assistant"; // Start with assistant so first user message can be added
        
        for (const msg of filteredMessages) {
          // Only add message if it alternates properly
          if (msg.role !== lastRole) {
            // For multimodal model, don't include previous images in the context
            // as the model only supports one image per request
            if (modelType === "multimodal" && msg.image) {
              // For previous messages with images in multimodal context, 
              // only include the text content
              messages.push({
                role: msg.role,
                content: msg.content
              });
            } else {
              messages.push({
                role: msg.role,
                content: msg.content
              });
            }
            lastRole = msg.role;
          }
        }
      }
      
      // Always add the current user message regardless of what was in the history
      // This is the message that was just created above containing the image

      // If we have an image, we always use the multimodal format regardless of model type
      // However, modelType should already be set to "multimodal" at this point
      if (image) {
          // Add the image data for multimodal requests with proper typing
          // For llama-3.2-90b-vision-preview, the image URL must be a data URL or a publicly accessible URL
          // Make sure image URL is properly formatted if it's a base64 data URL
          let imageUrl = image;
          if (image.startsWith('data:')) {
            // It's already a data URL, we can use it as is
            console.log("Using provided data URL for multimodal request");
          } else if (!image.startsWith('http')) {
            // If it's not a URL and not a data URL, prefix with data:image
            if (!image.startsWith('data:image')) {
              imageUrl = `data:image/jpeg;base64,${image}`;
              console.log("Converting base64 to proper data URL format");
            }
          }

          const multimodalMessage: MultimodalMessage = {
            role: "user",
            content: [
              { type: "text", text: content || "" }, // Ensure content is never undefined
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          };
          messages.push(multimodalMessage);
        } else {
          messages.push({
            role: "user",
            content: content || "" // Ensure content is never undefined
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
        
        // Generate a conversation title if this is a new conversation
        // This runs asynchronously and doesn't block the response
        generateAndSaveConversationTitle(conversationId).catch(err => {
          console.error("Failed to generate conversation title:", err);
        });
        
        // Log the no-API-key response we're sending
        console.log("Sending no-API-key response to client:", {
          assistantMessageId: assistantMessage.id,
          noApiKeyResponseStructure: "assistantMessage only"
        });
        
        // Send only the assistant message as the response to match other cases
        return res.json(assistantMessage);
      }

      // Call AI API based on the selected model
      try {
        // Log request information
        console.log(`Calling ${modelType} API (${modelConfig.apiProvider}) with:`, {
          model: modelConfig.modelName,
          temperature: 0.2,
          top_p: 0.9,
          stream: false,
          messagesCount: messages.length,
          messagesTypes: messages.map(msg => {
            if ('content' in msg && Array.isArray(msg.content)) {
              return 'multimodal';
            } else {
              return 'text';
            }
          })
        });
        
        // For debug purposes, log the actual shape of messages in a safe way
        console.log("API message structure:", 
          messages.map(msg => {
            if ('content' in msg && Array.isArray(msg.content)) {
              // For multimodal messages, log the structure without the full data URLs
              return {
                role: msg.role,
                contentTypes: msg.content.map(item => item.type)
              };
            } else {
              return { 
                role: msg.role, 
                contentType: 'text',
                // Log a preview of the text content for debugging
                contentPreview: typeof msg.content === 'string' ? 
                  (msg.content.length > 30 ? 
                    msg.content.substring(0, 30) + '...' : 
                    msg.content) : 
                  'unknown'
              };
            }
          })
        );

        // Determine the correct model parameter to use
        // For OpenRouter, we MUST use the exact modelId passed from the client
        let modelParam;
        if (modelConfig.apiProvider === "openrouter") {
          // Ensure we're using the correct modelId for OpenRouter
          modelParam = modelId;
          console.log(`OpenRouter request using explicit model ID: ${modelId}`);
        } else {
          // For other providers, use the modelName from the config
          modelParam = modelConfig.modelName;
        }
        
        // Create a cleaned version of the messages array for the payload
        // This is especially important for OpenRouter to ensure proper message format
        // Make extra sure we're only sending correctly formatted messages with no metadata embedded in content
        const cleanMessages = modelConfig.apiProvider === "openrouter" 
          ? messages.map(msg => {
              if (typeof msg.content === 'string') {
                // For text messages, ensure no metadata is embedded in the content
                return {
                  role: msg.role,
                  content: msg.content // Keep content as plain string without modifications
                };
              }
              // Handle multimodal content (array of content items)
              if (Array.isArray(msg.content)) {
                return {
                  role: msg.role,
                  content: msg.content.map(item => {
                    // Ensure each content item is properly formatted
                    if (item.type === 'text') {
                      return { type: 'text', text: item.text };
                    } else if (item.type === 'image_url') {
                      return { type: 'image_url', image_url: { url: item.image_url.url } };
                    }
                    return item;
                  })
                };
              }
              // Fallback to original message if structure is unexpected
              return msg;
            })
          : messages;
        
        if (modelConfig.apiProvider === "openrouter") {
          console.log('Created clean messages for OpenRouter API');
          // Log the first and last message for debugging without exposing full content
          const firstMsg = cleanMessages[0];
          const lastMsg = cleanMessages[cleanMessages.length - 1];
          console.log('OpenRouter message format check:', {
            messageCount: cleanMessages.length,
            firstMessageRole: firstMsg?.role,
            firstMessageContentType: typeof firstMsg?.content,
            lastMessageRole: lastMsg?.role,
            lastMessageContentType: typeof lastMsg?.content,
            isLastMessageMultimodal: Array.isArray(lastMsg?.content)
          });
        }
        
        // Construct the API payload
        const payload = {
          model: modelParam,
          messages: cleanMessages,
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        };
        
        // Log the actual model being used for debugging
        console.log('API request with model parameter:', {
          apiProvider: modelConfig.apiProvider,
          modelParameter: payload.model,
          originalModelId: modelId,
          isOpenRouter: modelConfig.apiProvider === "openrouter"
        });

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
        
        // Determine if we need a longer timeout based on the model
        let timeoutMs = 60000; // Default 60-second timeout for most models
        
        // For specific slower models, use an extended timeout
        if (modelConfig.apiProvider === "openrouter" && modelId) {
          if (
            modelId.includes('deepseek') || 
            modelId.includes('llama') || 
            modelId.includes('claude')
          ) {
            // Use 120-second timeout for known slower models
            timeoutMs = 120000; // 120 seconds
            console.log(`Using extended timeout (120s) for slower OpenRouter model: ${modelId}`);
          } else {
            // Use 90-second timeout for other OpenRouter models
            timeoutMs = 90000; // 90 seconds
            console.log(`Using extended timeout (90s) for OpenRouter model: ${modelId}`);
          }
        }
        
        // Create an AbortController for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        // Declare the response variable outside the try block so it's accessible later
        let response;
        
        try {
          response = await fetch(modelConfig.apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${modelConfig.apiKey}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          
          // Clear the timeout as we got a response
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`${modelConfig.apiProvider} API error details: ${errorText}`);
            
            // Use the error handler to parse the error
            const { parseOpenRouterError } = require("./errorHandler");
            const apiError = parseOpenRouterError(response.status, errorText);
            
            // Add more context to the error message
            throw new Error(
              `${modelConfig.apiProvider} API error: ${apiError.message} (Status: ${response.status}, Category: ${apiError.category})`
            );
          }
        } catch (fetchError) {
          // Handle AbortError (timeout) or network errors specifically
          clearTimeout(timeoutId);
          
          console.error(`Fetch error with ${modelType} model:`, {
            errorType: fetchError instanceof Error ? fetchError.name : 'Unknown',
            errorMessage: fetchError instanceof Error ? fetchError.message : String(fetchError),
            isAbortError: fetchError instanceof Error && fetchError.name === 'AbortError'
          });
          
          // Rethrow to be handled by the outer catch block
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`Request timeout exceeded after ${timeoutMs/1000} seconds. The ${modelId || modelType} model is taking too long to respond.`);
          }
          throw fetchError;
        }

        // Handle API responses
        let citations = null;
        
        // Initial message with empty content (will be updated with API response data)
        let assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: " ", // Use space instead of empty string to pass validation
          citations: null,
          modelId: modelId && modelId !== "" ? modelId : modelType, // Store the model ID correctly
        });
        
        // We've removed the streaming code for simplicity and reliability
        // Only non-streaming responses are supported
        
        // Ensure response exists and is valid
        if (!response) {
          console.error("Error: Response object is not available");
          throw new Error("Response object is not available");
        }
        
        // Clone the response before consuming it with json()
        const responseClone = response.clone();
        const data = await responseClone.json();
        
        console.log(`Received response from ${modelConfig.apiProvider} API:`, {
          model: data.model,
          object: data.object,
          choicesCount: data.choices?.length || 0
        });
        
        // Handle different API response formats based on provider and model
        try {
          let messageContent = "";
          let messageCitations = null;
          
          // Extract content based on provider/response format
          if (data.choices && data.choices.length > 0) {
            if (data.choices[0].message) {
              // OpenAI-compatible format (Groq and some Perplexity responses)
              messageContent = data.choices[0].message.content || "";
            } else if (data.choices[0].text) {
              // Alternative format sometimes used
              messageContent = data.choices[0].text || "";
            } else {
              console.error(`Unexpected response format from ${modelConfig.apiProvider}:`, 
                JSON.stringify(data.choices[0]).substring(0, 200));
              throw new Error(`Could not extract content from ${modelConfig.apiProvider} response`);
            }
          } else {
            console.error(`No choices in ${modelConfig.apiProvider} response:`, 
              JSON.stringify(data).substring(0, 200));
            throw new Error(`Empty response from ${modelConfig.apiProvider}`);
          }
          
          // Handle citations if present (Perplexity specific)
          if (data.citations) {
            messageCitations = data.citations;
          }
          
          // Update the assistant message with the content
          await storage.updateMessage(assistantMessage.id, {
            content: messageContent,
            citations: messageCitations,
            modelId: modelId && modelId !== "" ? modelId : modelType, // Ensure consistent modelId storage
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens
          });
          
          // Get the updated message
          const updatedMessage = await storage.getMessage(assistantMessage.id);
          if (updatedMessage) {
            assistantMessage = updatedMessage;
          }
          
          // Process token usage and deduct credits from user's balance
          if (data.usage && user) {
            const promptTokens = data.usage.prompt_tokens || 0;
            const completionTokens = data.usage.completion_tokens || 0;
            
            console.log(`Message token usage: prompt=${promptTokens}, completion=${completionTokens}`);
            
            // Get pricing based on the model used
            let pricing;
            if (modelId && (modelId.startsWith("openai/") || modelId.includes("/"))) {
              // OpenRouter model
              pricing = getModelPricing(modelId);
            } else {
              // Default model based on model type
              pricing = modelConfig.pricing || DEFAULT_MODEL_PRICING[modelType as keyof typeof DEFAULT_MODEL_PRICING] || {
                promptPrice: 0.000001,
                completionPrice: 0.000002
              };
            }
            
            // Calculate cost in hundredths of cents - uses pricing in dollars per million tokens
            const promptPricePerM = pricing.promptPrice * 1_000_000; 
            const completionPricePerM = pricing.completionPrice * 1_000_000;
            
            // Add image cost if applicable
            let imageCostHundredthsCents = 0;
            if (image && modelType === "multimodal") {
              const baseImageCostUsd = 0.002; // $0.002 per image
              imageCostHundredthsCents = Math.ceil(baseImageCostUsd * 10000);
              console.log(`Adding ${imageCostHundredthsCents} hundredths of cents (${baseImageCostUsd} USD) for image processing`);
            }
            
            // Calculate token cost in hundredths of cents
            const tokenCostHundredthsCents = calculateCreditsToCharge(
              promptTokens, 
              completionTokens, 
              promptPricePerM, 
              completionPricePerM
            );
            
            const totalCostHundredthsCents = tokenCostHundredthsCents + imageCostHundredthsCents;
            
            console.log(`Deducting ${totalCostHundredthsCents} hundredths of cents (${totalCostHundredthsCents/10000} USD) from user ${user.id}`);
            
            // Deduct cost from user's balance
            try {
              await storage.deductUserCredits(user.id, totalCostHundredthsCents);
              
              // Create usage log entry for analytics
              await storage.createUsageLog({
                userId: user.id,
                messageId: assistantMessage.id,
                modelId: modelId && modelId !== "" ? modelId : modelType,
                promptTokens: promptTokens,
                completionTokens: completionTokens,
                imageCount: image ? 1 : 0,
                creditsUsed: totalCostHundredthsCents,
                metadata: {
                  conversationId: conversationId,
                  modelType: modelType,
                  apiProvider: modelConfig.apiProvider
                }
              });
            } catch (creditError) {
              console.error(`Error deducting credits from user ${user.id}:`, creditError);
              // Continue with the response even if credit deduction fails
              // We'll handle this better in a future version
            }
          }
        } catch (extractError) {
          console.error(`Error extracting content from ${modelConfig.apiProvider} response:`, extractError);
          
          // Fallback: Update with error message
          await storage.updateMessage(assistantMessage.id, {
            content: `I apologize, but I encountered an error while processing your request with the ${modelType} model. Please try again or select a different model.`,
            citations: null
          });
          
          const updatedMessage = await storage.getMessage(assistantMessage.id);
          if (updatedMessage) {
            assistantMessage = updatedMessage;
          }
        }

        // If this is the first message in the conversation, generate a better title without extra API calls
        const conversation = await storage.getConversation(conversationId);
        if (conversation && conversation.title === "New Conversation") {
          // Generate an intelligent title based on the content
          let generatedTitle = "";
          
          // Extract main topic from first user message
          if (!content || content.length === 0) {
            // Handle empty content case
            generatedTitle = image ? "Image Analysis" : "New Conversation";
          } else if (content.length <= 25) {
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

        // Log the response structure we're about to send to the client
        console.log("Sending response to client:", {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          responseStructure: "{ userMessage, assistantMessage }"
        });
        
        // Generate a conversation title if this is a new conversation
        // This runs asynchronously and doesn't block the response
        generateAndSaveConversationTitle(conversationId).catch(err => {
          console.error("Failed to generate conversation title:", err);
        });
        
        // Send both user and assistant messages as the response
        // This matches what the frontend expects in useChat.ts
        res.json({
          userMessage,
          assistantMessage
        });
      } catch (error) {
        // Log error with additional diagnostic information
        console.error(`Error with ${modelType} model (${modelConfig.apiProvider}):`, {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : "Unknown",
          modelType,
          apiProvider: modelConfig.apiProvider,
          apiUrl: modelConfig.apiUrl,
          modelName: modelConfig.modelName,
          hasValidKey: isValidApiKey(modelConfig.apiKey),
          messagesCount: messages.length
        });
        
        // We previously had code here to clear a timeout
        // This was removed because the timeoutId variable is not defined in this scope
        // If we need to track and cancel timeouts in the future, we should define the variable in this scope
        
        // Parse error message and categorize it
        let apiError: ApiError;
        if (error instanceof Error && error.message.includes('API error:')) {
          // This is a pre-categorized error from our error handler
          const errorText = error.message;
          // Extract category from error message if available
          const categoryMatch = errorText.match(/Category:\s+(\w+)/);
          const category = categoryMatch ? categoryMatch[1] as ErrorCategory : ErrorCategory.UNKNOWN;
          
          // Create error object with appropriate user message
          apiError = {
            status: 500,
            category: category,
            message: errorText,
            userMessage: getUserMessageForCategory(category, modelType)
          };
        } else {
          // Use the handleInternalError utility to categorize other errors
          apiError = handleInternalError(error, modelConfig.apiProvider);
        }
        
        // Create a user-friendly error message based on the error category
        let errorMessage = `I apologize, but I encountered an error while processing your request with the ${modelType} model.`;
        errorMessage += " " + apiError.userMessage;
        
        // Create a fallback response (ensure content is never empty)
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: errorMessage,
          citations: null,
          modelId: modelId && modelId !== "" ? modelId : modelType, // Ensure consistent modelId storage
        });
        
        // Log the error response we're sending
        console.log("Sending error response to client:", {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          errorResponseStructure: "{ userMessage, assistantMessage }"
        });
        
        // Log API usage even for failed requests (with 0 tokens) for analytics
        // This helps track which models are experiencing errors
        if (user) {
          try {
            await storage.createUsageLog({
              userId: user.id,
              messageId: assistantMessage.id,
              modelId: modelId && modelId !== "" ? modelId : modelType,
              promptTokens: 0, // No tokens processed since it failed
              completionTokens: 0,
              imageCount: image ? 1 : 0,
              creditsUsed: 0, // No charge for errors
              metadata: {
                conversationId: conversationId,
                modelType: modelType,
                apiProvider: modelConfig.apiProvider,
                error: apiError.category,
                errorStatus: apiError.status
              }
            });
          } catch (logError) {
            // Don't let error logging failures affect the user experience
            console.error("Failed to log error usage:", logError);
          }
        }
        
        // Generate a conversation title if this is a new conversation
        // This runs asynchronously and doesn't block the response
        generateAndSaveConversationTitle(conversationId).catch(err => {
          console.error("Failed to generate conversation title:", err);
        });
        
        // Send both messages to match the success case format
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
      
      // Get the conversation first to check permissions
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Check if user is authorized to delete this conversation
      if (conversation.userId !== null) {
        // This is a registered user's conversation - check if it belongs to current user
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to delete this conversation" });
        }
      } else {
        // This is an anonymous conversation - check if it's in the session
        if (!req.session.userConversations?.includes(id)) {
          return res.status(403).json({ message: "You don't have permission to delete this conversation" });
        }
      }
      
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
      if (req.isAuthenticated()) {
        // For authenticated users, clear only their conversations
        const userId = (req.user as Express.User).id;
        const userConversations = await storage.getConversationsByUserId(userId);
        
        // Delete each conversation individually
        for (const conv of userConversations) {
          await storage.deleteConversation(conv.id);
        }
        
        console.log(`Cleared ${userConversations.length} conversations for authenticated user ${userId}`);
      } else {
        // For anonymous users, clear only session conversations
        if (req.session.userConversations && req.session.userConversations.length > 0) {
          // Delete each conversation in the session
          for (const convId of req.session.userConversations) {
            await storage.deleteConversation(convId);
          }
          console.log(`Cleared ${req.session.userConversations.length} conversations for anonymous session`);
          
          // Clear session data
          req.session.userConversations = [];
          req.session.save();
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing conversations:", error);
      res.status(500).json({ message: "Failed to clear conversations" });
    }
  });
  
  // Account Management Routes
  
  // Get payment transaction history
  app.get("/api/account/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const transactions = await storage.getPaymentTransactionsByUserId(userId);
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching payment transactions:", error);
      res.status(500).json({ message: "Failed to fetch payment transactions" });
    }
  });
  
  // Get usage history
  app.get("/api/account/usage", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      const usageLogs = await storage.getUsageLogsByUserId(userId);
      
      res.json(usageLogs);
    } catch (error) {
      console.error("Error fetching usage logs:", error);
      res.status(500).json({ message: "Failed to fetch usage logs" });
    }
  });
  
  // Get usage statistics for a time period
  app.get("/api/account/usage/stats", isAuthenticated, async (req, res) => {
    try {
      let userId = req.user!.id;
      
      // For development and testing, allow admin user override
      if (req.query.userId && process.env.NODE_ENV === "development") {
        userId = parseInt(req.query.userId as string, 10);
      }
      
      // Default to last 30 days if no dates provided
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      
      // Parse date range from query params if provided
      if (req.query.startDate && req.query.endDate) {
        const queryStartDate = new Date(req.query.startDate as string);
        const queryEndDate = new Date(req.query.endDate as string);
        
        // Validate dates
        if (!isNaN(queryStartDate.getTime()) && !isNaN(queryEndDate.getTime())) {
          startDate.setTime(queryStartDate.getTime());
          endDate.setTime(queryEndDate.getTime());
        }
      }
      
      // Get summary stats by model
      const stats = await storage.getUsageStatsByModel(userId, startDate, endDate);
      
      // Extend with cost in dollars for easier display
      const statsWithDollars = stats.map(stat => ({
        ...stat,
        totalCreditsDollars: (stat.totalCredits / 10000).toFixed(4) // Convert 10000 credits = $1
      }));
      
      // Get detailed usage logs for the same period
      const logs = await storage.getUsageLogsByTimeRange(userId, startDate, endDate);
      
      // Format logs to include dollar amounts
      const formattedLogs = logs.map(log => ({
        ...log,
        creditsDollars: (log.creditsUsed / 10000).toFixed(4), // Convert 10000 credits = $1
        date: new Date(log.createdAt).toISOString() // Ensure consistent date format
      }));
      
      res.json({
        stats: statsWithDollars,
        logs: formattedLogs,
        period: {
          startDate,
          endDate
        }
      });
    } catch (error) {
      console.error("Error fetching usage statistics:", error);
      res.status(500).json({ message: "Failed to fetch usage statistics" });
    }
  });
  
  // Export usage statistics as CSV
  app.get("/api/account/usage/export", isAuthenticated, async (req, res) => {
    try {
      let userId = req.user!.id;
      
      // For development and testing, allow admin user override
      if (req.query.userId && process.env.NODE_ENV === "development") {
        userId = parseInt(req.query.userId as string, 10);
      }
      
      // Default to last 30 days if no dates provided
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      
      // Parse date range from query params if provided
      if (req.query.startDate && req.query.endDate) {
        const queryStartDate = new Date(req.query.startDate as string);
        const queryEndDate = new Date(req.query.endDate as string);
        
        // Validate dates
        if (!isNaN(queryStartDate.getTime()) && !isNaN(queryEndDate.getTime())) {
          startDate.setTime(queryStartDate.getTime());
          endDate.setTime(queryEndDate.getTime());
        }
      }
      
      // Check if we should export detailed logs or summary by model
      const exportType = req.query.type as string || 'summary';
      
      if (exportType === 'detailed') {
        // Get detailed logs
        const logs = await storage.getUsageLogsByTimeRange(userId, startDate, endDate);
        
        // Generate CSV string
        const header = 'Date,Time,Model,MessageID,ConversationID,Prompt Tokens,Completion Tokens,Images,Credits Used,Cost (USD)';
        
        const formatDateTime = (dateStr: string) => {
          const date = new Date(dateStr);
          return {
            date: date.toISOString().split('T')[0],
            time: date.toISOString().split('T')[1].split('.')[0]
          };
        };
        
        const rows = logs.map(log => {
          const { date, time } = formatDateTime(log.createdAt.toString());
          const costUSD = (log.creditsUsed / 10000).toFixed(4); // Convert 10000 credits = $1
          const messageId = log.messageId || 'N/A';
          
          // Get conversationId from the associated message if available
          let conversationId = 'N/A';
          if (log.messageId && log.metadata && typeof log.metadata === 'object' && 'conversationId' in log.metadata) {
            conversationId = log.metadata.conversationId;
          }
          
          return `"${date}","${time}","${log.modelId}","${messageId}","${conversationId}",${log.promptTokens},${log.completionTokens},${log.imageCount},${log.creditsUsed},${costUSD}`;
        });
        
        const csvContent = [header, ...rows].join('\n');
        
        // Format date for filename
        const formatDate = (date: Date) => date.toISOString().split('T')[0];
        const filename = `usage_detailed_log_${formatDate(startDate)}_to_${formatDate(endDate)}.csv`;
        
        // Set response headers and send
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
      } else {
        // Default to summary by model
        const stats = await storage.getUsageStatsByModel(userId, startDate, endDate);
        
        // Generate CSV string
        const header = 'Model,Total Tokens,Prompt Tokens,Completion Tokens,Images,Usage Count,Total Credits,Cost (USD)';
        const rows = stats.map(stat => {
          const costUSD = (stat.totalCredits / 10000).toFixed(4); // Convert 10000 credits = $1
          return `"${stat.modelId}",${stat.totalTokens},${stat.promptTokens},${stat.completionTokens},${stat.imageCount},${stat.usageCount},${stat.totalCredits},${costUSD}`;
        });
        
        const csvContent = [header, ...rows].join('\n');
        
        // Format date for filename
        const formatDate = (date: Date) => date.toISOString().split('T')[0];
        const filename = `usage_summary_report_${formatDate(startDate)}_to_${formatDate(endDate)}.csv`;
        
        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Send CSV content
        res.send(csvContent);
      }
    } catch (error) {
      console.error("Error exporting usage statistics:", error);
      res.status(500).json({ message: "Failed to export usage statistics" });
    }
  });
  
  // Get or create user settings
  app.get("/api/account/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      let settings = await storage.getUserSettings(userId);
      
      // If settings don't exist, create default settings
      if (!settings) {
        settings = await storage.createOrUpdateUserSettings({
          userId,
          lowBalanceThreshold: 5000, // Default 5000 credits ($0.50)
          emailNotificationsEnabled: true
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      res.status(500).json({ message: "Failed to fetch user settings" });
    }
  });
  
  // Update user settings
  app.put("/api/account/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Define schema for settings validation
      const settingsSchema = z.object({
        lowBalanceThreshold: z.number().min(0).optional(),
        emailNotificationsEnabled: z.boolean().optional()
      });
      
      const validationResult = settingsSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid settings data", 
          errors: validationResult.error.errors 
        });
      }
      
      const updatedSettings = await storage.createOrUpdateUserSettings({
        userId,
        ...validationResult.data
      });
      
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Failed to update user settings" });
    }
  });

  // Register document routes for RAG functionality
  registerDocumentRoutes(app);
  
  // Register content handling routes for images and other media
  registerContentRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
