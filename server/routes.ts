import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";
import passport from "passport";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
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
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
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
    apiProvider: "perplexity",
    modelName: "sonar-reasoning",  // Updated with the correct model name
    apiUrl: "https://api.perplexity.ai/chat/completions",
    apiKey: PERPLEXITY_API_KEY,
    pricing: DEFAULT_MODEL_PRICING.search
  },
  multimodal: {
    apiProvider: "groq",
    modelName: "llama-3.2-90b-vision-preview",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: GROQ_API_KEY,
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
      return res.status(401).json({ message: "Valid OpenRouter API key is required" });
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
        return res.status(response.status).json({ 
          message: "Failed to fetch models from OpenRouter", 
          error: errorText 
        });
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
      return res.status(500).json({ 
        message: "Failed to fetch models from OpenRouter", 
        error: error instanceof Error ? error.message : String(error)
      });
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
      
      // Set userId if user is authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : null;
      
      const conversation = await storage.createConversation({ 
        title, 
        userId
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
  
  // Streaming endpoint for chat messages
  app.get("/api/conversations/:id/messages/stream", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, modelType = "reasoning", modelId = "", image } = req.query as { 
        content?: string;
        modelType?: string;
        modelId?: string;
        image?: string;
      };
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Only allow reasoning model for streaming (fail fast for other models)
      if (modelType !== "reasoning") {
        return res.status(400).json({ 
          message: `Streaming is only supported for the reasoning model, not for ${modelType}.`
        });
      }
      
      // If an image is present, don't allow streaming (since we need to use multimodal model)
      if (image) {
        return res.status(400).json({ 
          message: "Streaming is not supported for image inputs. Please use the standard API endpoint."
        });
      }
      
      // Get the model configuration based on the requested model type
      const modelConfig = MODEL_CONFIGS.reasoning; // Always use reasoning for streaming
      
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
      
      // Create model-specific system message
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

      // Initialize the messages array
      const messages: ApiMessage[] = [
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
          console.error(`${modelConfig.apiProvider} API streaming error: ${errorText}`);
          throw new Error(`${modelConfig.apiProvider} API returned ${response.status}`);
        }

        // Create initial message with placeholder content (will be updated with streaming data)
        let assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: "...", // Placeholder content that will be replaced
          citations: null,
        });
        
        // Send the initial user message to setup the UI
        res.write(`data: ${JSON.stringify({ 
          type: "initial", 
          userMessage,
          assistantMessageId: assistantMessage.id 
        })}\n\n`);
        
        // Process the stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to get reader from response");
        }
        
        let assistantContent = "";
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines from the buffer
          let lines = buffer.split("\n");
          buffer = lines.pop() || ""; // The last line might be incomplete
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta?.content || "";
                
                if (delta) {
                  assistantContent += delta;
                  res.write(`data: ${JSON.stringify({ 
                    type: "chunk", 
                    content: delta,
                    id: assistantMessage.id
                  })}\n\n`);
                }
              } catch (e) {
                console.error("Error parsing streaming response:", e);
              }
            }
          }
        }
        
        // Update the stored message with the full content
        const updatedMessage = await storage.getMessage(assistantMessage.id);
        if (updatedMessage) {
          assistantMessage = {
            ...updatedMessage,
            content: assistantContent
          };
          // Update the message in storage
          await storage.updateMessage(assistantMessage.id, {
            content: assistantContent
          });
        }
        
        // Final message to signal completion
        res.write(`data: ${JSON.stringify({ 
          type: "done", 
          userMessage,
          assistantMessage
        })}\n\n`);
        
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
        // Create a detailed error message for the client
        let errorMessage = "Failed to process streaming response";
        
        if (error instanceof Error) {
          console.error(`Error in streaming response:`, error.message);
          
          // Provide more specific error messages based on the error type
          if (error.message.includes("Failed to get reader")) {
            errorMessage = "Server could not process the streaming response";
          } else if (error.message.includes("API returned")) {
            // Extract the status code if present
            const statusMatch = error.message.match(/API returned (\d+)/);
            if (statusMatch && statusMatch[1]) {
              const status = statusMatch[1];
              
              // Customize message based on status code
              if (status === "401" || status === "403") {
                errorMessage = "Authentication error with the API. Please try a different model.";
              } else if (status === "429") {
                errorMessage = "API rate limit exceeded. Please try again in a moment.";
              } else if (status === "500") {
                errorMessage = "API server error. Please try again or select a different model.";
              } else if (status === "502" || status === "504") {
                errorMessage = "API gateway timeout. The server is currently experiencing high load.";
              } else {
                errorMessage = `API error (${status}). Please try again or select a different model.`;
              }
            } else {
              errorMessage = "API error. Please try again or select a different model.";
            }
          } else if (error.message.toLowerCase().includes("timeout")) {
            errorMessage = "Request timed out. The server is taking too long to respond.";
          }
        } else {
          console.error(`Unknown error in streaming response:`, error);
        }
        
        // Send the error event to the client
        res.write(`data: ${JSON.stringify({ 
          type: "error", 
          message: errorMessage
        })}\n\n`);
        
        res.end();
      }
    } catch (error) {
      console.error('Server streaming error:', error);
      res.status(500).json({ message: "Failed to process streaming message" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      let { content = "", modelType = "reasoning", modelId = "", image } = req.body;
      
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
      
      // Disable streaming (using standard requests only)
      const shouldStream = false;

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
      
      // Prepare messages for Perplexity API
      // Filter out any invalid messages and ensure proper role alternation
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      // Sort messages by ID to ensure correct sequence
      filteredMessages.sort((a, b) => a.id - b.id);
      
      // Create model-specific system message
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

      // Initialize the messages array with proper typing for both text and multimodal messages
      const messages: ApiMessage[] = [];
      
      // Only add system message if we're not using images with multimodal model
      // Groq's llama-3.2-90b-vision-preview doesn't support system messages with images
      if (!(modelType === "multimodal" && image)) {
        messages.push({
          role: "system",
          content: systemContent,
        });
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
        
        // Update the conversation title even without API key
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
          
          await storage.updateConversationTitle(conversationId, generatedTitle);
        }
        
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
          stream: shouldStream,
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
          stream: shouldStream
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

        // Handle streaming vs non-streaming responses
        let assistantContent = "";
        let citations = null;
        
        // Initial message with empty content (will be updated with streaming data)
        let assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: " ", // Use space instead of empty string to pass validation
          citations: null,
        });
        
        if (shouldStream) {
          // Set up Server-Sent Events
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("Failed to get reader from response");
          }
          
          // Send the initial user message to setup the UI
          res.write(`data: ${JSON.stringify({ 
            type: "initial", 
            userMessage,
            assistantMessageId: assistantMessage.id 
          })}\n\n`);
          
          // Process the stream
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines from the buffer
            let lines = buffer.split("\n");
            buffer = lines.pop() || ""; // The last line might be incomplete
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices[0]?.delta?.content || "";
                  
                  if (delta) {
                    assistantContent += delta;
                    res.write(`data: ${JSON.stringify({ 
                      type: "chunk", 
                      content: delta,
                      id: assistantMessage.id
                    })}\n\n`);
                  }
                } catch (e) {
                  console.error("Error parsing streaming response:", e);
                }
              }
            }
          }
          
          // Update the stored message with the full content
          await storage.updateMessage(assistantMessage.id, {
            content: assistantContent
          });
          
          // Get the updated message
          const updatedMessage = await storage.getMessage(assistantMessage.id);
          if (updatedMessage) {
            assistantMessage = updatedMessage;
          }
          
          // Estimate token usage for streaming response since we don't get usage data directly
          if (user) {
            // Approximate tokens based on content length
            // OpenAI uses ~4 chars per token as a rough estimate
            const promptTokens = JSON.stringify(messages).length / 4;
            const completionTokens = assistantContent.length / 4;
            
            console.log(`Estimated streaming token usage: prompt=${Math.ceil(promptTokens)}, completion=${Math.ceil(completionTokens)}`);
            
            // Use default pricing for reasoning model
            const pricing = MODEL_CONFIGS.reasoning.pricing || {
              promptPrice: 0.0000005,
              completionPrice: 0.0000015
            };
            
            // Calculate cost in hundredths of cents - uses pricing in dollars per million tokens
            const promptPricePerM = pricing.promptPrice * 1_000_000; 
            const completionPricePerM = pricing.completionPrice * 1_000_000;
            
            // Calculate total cost to deduct in hundredths of cents
            const costInHundredthsOfCents = calculateCreditsToCharge(
              Math.ceil(promptTokens), 
              Math.ceil(completionTokens), 
              promptPricePerM, 
              completionPricePerM
            );
            
            console.log(`Deducting ${costInHundredthsOfCents} hundredths of cents (${costInHundredthsOfCents/10000} USD) from user ${user.id} for streaming response`);
            
            // Deduct cost from user's balance
            try {
              await storage.deductUserCredits(user.id, costInHundredthsOfCents);
            } catch (creditError) {
              console.error(`Error deducting credits from user ${user.id}:`, creditError);
              // Continue with the response even if credit deduction fails
            }
          }
          
          // Final message to signal completion
          res.write(`data: ${JSON.stringify({ 
            type: "done", 
            userMessage,
            assistantMessage
          })}\n\n`);
          
          res.end();
          
          // Since we've handled the response with streaming, return early
          return;
        } else {
          // Non-streaming response
          const data = await response.json();
          
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
              citations: messageCitations
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
          modelType,
          apiProvider: modelConfig.apiProvider,
          apiUrl: modelConfig.apiUrl,
          modelName: modelConfig.modelName,
          hasValidKey: isValidApiKey(modelConfig.apiKey),
          messagesCount: messages.length
        });
        
        // Create a more detailed error message to help debugging
        let errorMessage = `I apologize, but I encountered an error while processing your request with the ${modelType} model.`;
        
        // Add specific suggestions based on the error
        if (error instanceof Error) {
          const errorText = error.message.toLowerCase();
          
          if (errorText.includes("timeout") || errorText.includes("network")) {
            errorMessage += " There seems to be a network issue. Please check your connection and try again.";
          } else if (errorText.includes("unauthorized") || errorText.includes("authentication") || errorText.includes("401")) {
            errorMessage += " There might be an issue with the API authentication. Please try a different model or contact support.";
          } else if (errorText.includes("quota") || errorText.includes("rate limit") || errorText.includes("429")) {
            errorMessage += " The API rate limit may have been exceeded. Please try again in a moment or select a different model.";
          } else {
            errorMessage += " Please try again or select a different model.";
          }
        } else {
          errorMessage += " Please try again or select a different model.";
        }
        
        // Create a fallback response (ensure content is never empty)
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: errorMessage,
          citations: null,
        });
        
        // Log the error response we're sending
        console.log("Sending error response to client:", {
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          errorResponseStructure: "{ userMessage, assistantMessage }"
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
