import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertMessageSchema } from "@shared/schema";
import passport from "passport";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";
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
 * Generates and saves a conversation title based on the first user message.
 * Uses an AI model to generate a concise, meaningful title.
 */
async function generateAndSaveConversationTitle(conversationId: number): Promise<void> {
  try {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || conversation.title !== "New Conversation") return;

    const firstUserMessage = await storage.getFirstUserMessage(conversationId);
    if (!firstUserMessage) return;
    const firstUserMessageContent = firstUserMessage.content;

    let openRouterModels;
    try {
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

    const freeModels = openRouterModels.filter((model: any) => model.isFree === true);
    if (!freeModels.length) {
      console.warn("No free models available for title generation.");
      return;
    }

    const preferredTitleModels = [
      "qwen/qwen-2.5-vl-3b-instruct",
      "allenai/molmo-7b-d",
      "meta-llama/llama-4-maverick-17b-instruct-128e",
      "meta-llama/llama-4-scout-17b-instruct-16e",
      "google/gemini-2.5-pro-experimental"
    ];

    let selectedModelId = null;
    for (const preferredModelId of preferredTitleModels) {
      if (freeModels.some((model: any) => model.id === preferredModelId)) {
        selectedModelId = preferredModelId;
        break;
      }
    }
    if (!selectedModelId && freeModels.length > 0) {
      selectedModelId = freeModels[0].id;
    }
    if (!selectedModelId) {
      console.warn("Could not select a suitable model for title generation.");
      return;
    }

    try {
      const titlePromptMessages = [
        {
          role: "user",
          content: `Based on the following user message, suggest a concise and relevant conversation title (max 7 words):\n\nUser Message: '''${firstUserMessageContent}'''\n\nTitle:`
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
      try {
        const data = await response.json();
        let generatedTitle = data.choices?.[0]?.message?.content;
        if (generatedTitle) {
          generatedTitle = generatedTitle.trim().replace(/^["']|["']$/g, "");
          if (generatedTitle) {
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
  }
}

type ModelType = "reasoning" | "search" | "multimodal";
import "express-session";

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

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) return next();

  if (process.env.NODE_ENV !== "production" && req.query.userId) {
    const userId = parseInt(req.query.userId as string, 10);
    if (!isNaN(userId)) {
      storage.getUserById(userId)
        .then(user => {
          if (user) {
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
        })
        .catch(err => {
          console.error("Error fetching user for development authentication:", err);
          res.status(500).json({ message: "Server error during development authentication" });
        });
      return;
    }
  }
  res.status(401).json({ message: "Unauthorized" });
};

type MultimodalContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface MultimodalMessage {
  role: string;
  content: MultimodalContentItem[];
}

type ApiMessage =
  | { role: string; content: string }
  | MultimodalMessage;

declare module "express-session" {
  interface SessionData {
    userConversations?: number[];
  }
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const isPerplexityKeyValid = PERPLEXITY_API_KEY && PERPLEXITY_API_KEY.length > 10;
const isGroqKeyValid = GROQ_API_KEY && GROQ_API_KEY.length > 10;
const isOpenRouterKeyValid = OPENROUTER_API_KEY && OPENROUTER_API_KEY.length > 10;

console.log("API Key Status:");
console.log(`- Perplexity API Key: ${isPerplexityKeyValid ? "Valid" : "Invalid or Missing"}`);
console.log(`- Groq API Key: ${isGroqKeyValid ? "Valid" : "Invalid or Missing"}`);
console.log(`- OpenRouter API Key: ${isOpenRouterKeyValid ? "Valid" : "Invalid or Missing"}`);

function isValidApiKey(key: string | undefined | null): boolean {
  if (!key) return false;
  if (typeof key !== "string") return false;
  const isLongEnough = key.length > 10;
  const hasValidPrefix =
    (key.startsWith("grk_") && key.length >= 50) ||
    (key.startsWith("pplx-") && key.length >= 40);
  if (!isLongEnough) {
    console.warn(`API key validation failed: Key length less than 10 (actual: ${key.length})`);
  } else if (!hasValidPrefix) {
    console.warn(`API key validation warning: Key doesn't have a recognized prefix`);
  }
  return isLongEnough;
}

const loadModelPricing = () => {
  try {
    const modelsData = fs.readFileSync(path.join(process.cwd(), "models.json"), "utf8");
    return JSON.parse(modelsData);
  } catch (error) {
    console.error("Error loading models.json:", error);
    return [];
  }
};

const modelPricingData = loadModelPricing();

const getModelPricing = (modelId: string) => {
  const model = modelPricingData.find((m: any) => m.id === modelId);
  if (model) {
    return {
      promptPrice: parseFloat(model.pricing.prompt) || 0,
      completionPrice: parseFloat(model.pricing.completion) || 0
    };
  }
  return {
    promptPrice: 0.000001,
    completionPrice: 0.000002
  };
};

const DEFAULT_MODEL_PRICING = {
  reasoning: {
    promptPrice: 0.0000005,
    completionPrice: 0.0000015
  },
  search: {
    promptPrice: 0.000001,
    completionPrice: 0.000002
  },
  multimodal: {
    promptPrice: 0.000001,
    completionPrice: 0.000002,
    imagePrice: 0.002
  }
};

// Default OpenRouter configuration - only used if no modelId is provided
const DEFAULT_OPENROUTER_CONFIG = {
  apiProvider: "openrouter",
  modelName: "openai/gpt-4o", // Default model if none specified
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: OPENROUTER_API_KEY,
  pricing: DEFAULT_MODEL_PRICING.multimodal
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/config", (req, res) => {
    res.json({
      paypalClientId: process.env.PAYPAL_CLIENT_ID || ""
    });
  });

  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/login-error", successRedirect: "/" }));
  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
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

  app.get("/api/user/presets", isAuthenticated, async (req, res) => {
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

  app.put("/api/user/presets", isAuthenticated, async (req, res) => {
    try {
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
      const dbPresets = {
        preset1ModelId: preset1,
        preset2ModelId: preset2,
        preset3ModelId: preset3,
        preset4ModelId: preset4,
        preset5ModelId: preset5,
        updatedAt: new Date()
      };
      console.log("Updating user presets in database:", {
        userId,
        presetCount: Object.keys(validationResult.data).length,
        dbColumns: Object.keys(dbPresets)
      });
      try {
        await db.update(users).set(dbPresets).where(eq(users.id, userId));
        console.log("User presets updated successfully");
      } catch (dbError) {
        console.error("Database error while updating presets:", dbError);
        throw new Error(`Database update failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
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

  app.get("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error during logout", error: err.message });
      }
      res.redirect("/");
    });
  });

  app.get("/api/debug/keys", (req, res) => {
    const perplexityKeyStatus = PERPLEXITY_API_KEY ? "exists (length: " + PERPLEXITY_API_KEY.length + ")" : "missing";
    const groqKeyStatus = GROQ_API_KEY ? "exists (length: " + GROQ_API_KEY.length + ")" : "missing";
    const apiEnvVars = Object.keys(process.env).filter(key =>
      key.includes("API") || key.includes("KEY") || key.includes("GROQ") || key.includes("PERPLEXITY")
    );
    const isDeployed = process.env.REPL_ID && process.env.REPL_OWNER;
    const deploymentInfo = {
      isDeployed,
      replId: process.env.REPL_ID || "Not available",
      replSlug: process.env.REPL_SLUG || "Not available",
      nodeEnv: process.env.NODE_ENV || "Not set",
      isProduction: process.env.NODE_ENV === "production"
    };
    console.log(`Debug keys request from ${isDeployed ? "deployed" : "development"} environment`);
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
      const models = data.data.map((model: any) => {
        const promptCost = model.pricing?.prompt;
        const completionCost = model.pricing?.completion;
        const requestCost = model.pricing?.request;
        const isPromptFree = promptCost === 0 || promptCost === null || promptCost === undefined ||
          (typeof promptCost === "string" && parseFloat(promptCost) === 0);
        const isCompletionFree = completionCost === 0 || completionCost === null || completionCost === undefined ||
          (typeof completionCost === "string" && parseFloat(completionCost) === 0);
        const isRequestFree = requestCost === 0 || requestCost === null || requestCost === undefined ||
          (typeof requestCost === "string" && parseFloat(requestCost) === 0);
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
      if (provider === "perplexity") {
        const testPayload = {
          model: "sonar-reasoning",
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
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (!response.ok) {
        const errorText = await response.text();
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

  app.get("/ads.txt", (req, res) => {
    res.sendFile("client/public/ads.txt", { root: "." });
  });

  app.get("/sitemap.xml", (req, res) => {
    res.sendFile("client/public/sitemap.xml", { root: "." });
  });

  app.get("/api/credits/packages", (req, res) => {
    res.json(CREDIT_PACKAGES);
  });

  app.post("/api/credits/admin-credit", async (req, res) => {
    try {
      const { email, amount } = req.body;
      if (!email || !amount) {
        return res.status(400).json({ message: "Email and amount are required" });
      }
      const usersWithEmail = await db.select().from(users).where(eq(users.email, email));
      if (usersWithEmail.length === 0) {
        return res.status(404).json({ message: "User not found with email: " + email });
      }
      const user = usersWithEmail[0];
      console.log(`Found user with ID ${user.id} and email ${email}`);
      const credits = Math.floor(parseFloat(amount.toString()) * 10000);
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

  app.post("/api/paypal/create-custom-order", isAuthenticated, async (req, res) => {
    try {
      if (!isPayPalConfigValid) {
        return res.status(500).json({ message: "PayPal is not properly configured" });
      }
      const customAmountSchema = z.object({
        amount: z.number().min(5)
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
      if (captureResult.credits) {
        const userId = req.user!.id;
        await storage.addUserCredits(userId, captureResult.credits);
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
      console.log(`Received PayPal webhook event: ${eventType}`);
      return res.status(200).send();
    } catch (error) {
      console.error("Error processing PayPal webhook:", error);
      res.status(500).json({
        message: "Failed to process PayPal webhook",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/conversations", async (req, res) => {
    try {
      let conversations;
      if (req.isAuthenticated()) {
        const userId = (req.user as Express.User).id;
        console.log(`Getting conversations for authenticated user ID: ${userId}`);
        conversations = await storage.getConversationsByUserId(userId);
        console.log(`Found ${conversations.length} conversations for user ${userId}`);
      } else {
        if (!req.session.userConversations) {
          req.session.userConversations = [];
        }
        const allConversations = await storage.getConversations();
        if (req.session.userConversations.length === 0 && allConversations.length > 0) {
          req.session.userConversations = allConversations
            .filter(conv => conv.userId === null)
            .map(conv => conv.id);
          await new Promise<void>((resolve) => {
            req.session.save(() => resolve());
          });
          console.log("Restored anonymous conversations to session:", req.session.userConversations);
        }
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
      if (!req.session.userConversations) {
        req.session.userConversations = [];
      }
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : null;
      const conversation = await storage.createConversation({ title, userId });
      if (!userId) {
        req.session.userConversations.push(conversation.id);
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
      if (conversation.userId !== null) {
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      } else {
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
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      if (conversation.userId !== null) {
        if (!req.isAuthenticated() || (req.user as Express.User).id !== conversation.userId) {
          return res.status(403).json({ message: "You don't have permission to access this conversation" });
        }
      } else {
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

  // === Fixed POST /api/conversations/:id/messages endpoint ===
  // Streaming endpoint for chat messages
  app.get("/api/conversations/:id/messages/stream", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id, 10);
      const { content = "", modelType: initialModelType = "reasoning", modelId: initialModelId = "", image = "" } = req.query as {
        content?: string;
        modelType?: string;
        modelId?: string;
        image?: string;
      };
      
      // Create mutable copies of the query parameters
      let modelType = initialModelType;
      let modelId = initialModelId;
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Disable compression middleware for this route
      res.setHeader("X-No-Compression", "true");
      
      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      // Start with a heartbeat
      res.write("event: heartbeat\ndata: {}\n\n");
      
      // Create OpenRouter API key validation
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
      const isOpenRouterKeyValid = OPENROUTER_API_KEY.length > 0;
      
      // Only use OpenRouter API
      if (!isOpenRouterKeyValid) {
        return res.status(401).json({ 
          message: "OpenRouter API key is required",
          details: "A valid OpenRouter API key is required to use this endpoint."
        });
      }
      
      // Default to a multimodal model if an image is present
      if (image && (!modelId || modelId === "")) {
        console.log("Image detected in streaming request, defaulting to GPT-4 Vision");
        modelId = "openai/gpt-4-vision-preview";
      }
      
      if (modelId === "not set") {
        console.error("Invalid modelId received in streaming request: 'not set'");
        modelId = "";
      }
      
      // Use the default model if no specific one is provided
      if (!modelId || modelId === "") {
        console.log("No specific modelId provided. Using default OpenRouter model.");
        modelId = DEFAULT_OPENROUTER_CONFIG.modelName;
      }
      
      // Set up model configuration for OpenRouter
      const modelConfig = {
        apiProvider: "openrouter",
        modelName: modelId,
        apiUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: OPENROUTER_API_KEY
      };
      
      console.log(`Using OpenRouter with model: ${modelId} for streaming request`);
      
      // Create user message in the database
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content: content || "",
        image: image || undefined,
        citations: null
      });
      
      // Get previous messages for context
      const previousMessages = await storage.getMessagesByConversation(conversationId);
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      filteredMessages.sort((a, b) => a.id - b.id);
      
      // Prepare RAG context if available
      let ragContext = "";
      try {
        const { chunks, documents } = await findSimilarChunks(content, conversationId);
        if (chunks.length > 0) {
          ragContext = formatContextForPrompt(chunks, documents);
          console.log(`Added RAG context from ${chunks.length} document chunks for streaming request`);
        }
      } catch (error) {
        console.error("Error fetching RAG context for streaming:", error);
      }
      
      // Prepare messages array for API
      const messages: ApiMessage[] = [];
      
      // Add system message with RAG context if available
      if (ragContext) {
        const systemContent = `You are an AI assistant responding to a user query. Use the following document context provided below to answer the query. Prioritize information found in the context. If the context does not contain the answer, state that.\n\nRelevant Document Context:\n${ragContext}\n\nUse the above document information to answer the query.`;
        // Only add system message if there's no image (for models that don't handle both well)
        if (!image) {
          messages.push({
            role: "system",
            content: systemContent
          });
        }
      }
      
      // Add conversation history
      let lastRole = "assistant";
      for (const msg of filteredMessages) {
        if (msg.role !== lastRole) {
          if (msg.image) {
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
      
      // Handle image if provided
      if (image) {
        let imageUrl = image;
        if (image.startsWith("data:")) {
          console.log("Using provided data URL for multimodal streaming request");
        } else if (!image.startsWith("http")) {
          if (!image.startsWith("data:image")) {
            imageUrl = `data:image/jpeg;base64,${image}`;
          }
        }
        
        // Add multimodal message
        messages.push({
          role: "user",
          content: [
            { type: "text", text: content },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        });
      } else {
        // Add simple text message if no image
        messages.push({
          role: "user",
          content: content
        });
      }
      
      // Create assistant message placeholder
      const assistantMessage = await storage.createMessage({
        conversationId,
        role: "assistant",
        content: "", // Will be filled through streaming
        citations: null,
        modelId: modelId || undefined
      });
      
      // Clean messages for OpenRouter API
      const cleanMessages = modelConfig.apiProvider === "openrouter"
        ? messages.map(msg => {
            if (typeof msg.content === "string") {
              return {
                role: msg.role,
                content: msg.content
              };
            }
            if (Array.isArray(msg.content)) {
              return {
                role: msg.role,
                content: msg.content.map(item => {
                  if (item.type === "text") {
                    return { type: "text", text: item.text };
                  } else if (item.type === "image_url") {
                    return { type: "image_url", image_url: { url: item.image_url.url } };
                  }
                  return item;
                })
              };
            }
            return msg;
          })
        : messages;
      
      // Prepare API request payload
      const payload = {
        model: modelId, // Always use the direct modelId for OpenRouter
        messages: cleanMessages,
        temperature: 0.2,
        top_p: 0.9,
        stream: true // Enable streaming
      };
      
      console.log(`Streaming API request to ${modelConfig.apiProvider} with model: ${payload.model}`);
      
      // Call the API
      const apiResponse = await fetch(modelConfig.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${modelConfig.apiKey}`
        },
        body: JSON.stringify(payload)
      });
      
      // Handle API errors
      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`Streaming API error from ${modelConfig.apiProvider}: ${errorText}`);
        
        let apiError: ApiError;
        if (modelConfig.apiProvider === "openrouter") {
          apiError = parseOpenRouterError(apiResponse.status, errorText);
        } else {
          apiError = handleInternalError(new Error(`${modelConfig.apiProvider} API error: ${apiResponse.status}`));
        }
        
        // If headers haven't been sent yet, send error response
        if (!res.headersSent) {
          sendErrorResponse(res, apiError);
        } else {
          // If headers were sent, send error as SSE
          res.write(`event: error\ndata: ${JSON.stringify({ 
            error: apiError.userMessage || "Error connecting to AI model"
          })}\n\n`);
          res.end();
        }
        return;
      }
      
      // Check if response body exists
      if (!apiResponse.body) {
        console.error("Streaming API response body is null");
        // If headers haven't been sent yet, send error response
        if (!res.headersSent) {
          res.status(500).json({ message: "Streaming API response body is null" });
        } else {
          // If headers were sent, send error as SSE
          res.write(`event: error\ndata: ${JSON.stringify({ 
            error: "Server received empty response from AI model"
          })}\n\n`);
          res.end();
        }
        return;
      }

      // For OpenRouter, we'll pipe the streaming response directly to the client
      if (modelConfig.apiProvider === "openrouter") {
        console.log("Directly piping OpenRouter SSE response to client");
        let accumulatedContent = "";
        
        try {
          // Get reader from response body stream
          const reader = apiResponse.body.getReader();
          
          // Process the stream
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log("OpenRouter stream complete");
              
              // Update message in database with complete content
              await storage.updateMessage(assistantMessage.id, {
                content: accumulatedContent
              });
              
              // Send final [DONE] marker to client
              res.write(`data: [DONE]\n\n`);
              break;
            }
            
            // Decode the chunk and pipe directly to client
            const chunk = new TextDecoder().decode(value);
            
            // Write the raw chunk directly to the client
            res.write(chunk);
            
            // Also extract content for database storage
            try {
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                  const data = line.substring(6);
                  try {
                    const jsonData = JSON.parse(data);
                    const delta = jsonData.choices?.[0]?.delta?.content;
                    if (delta) {
                      accumulatedContent += delta;
                    }
                  } catch (e) {
                    // Ignore parsing errors for accumulation
                  }
                }
              }
            } catch (extractError) {
              console.error("Error extracting content for database:", extractError);
              // Continue streaming even if accumulation fails
            }
          }
        } catch (streamError) {
          console.error("Error during OpenRouter stream piping:", streamError);
          res.write(`event: error\ndata: ${JSON.stringify({ 
            error: "Error processing AI response stream"
          })}\n\n`);
        } finally {
          // Ensure the reader is released and response is ended
          res.end();
        }
      } else {
        // For non-OpenRouter providers, keep the original stream processing
        const reader = apiResponse.body.getReader();
        let accumulatedContent = "";
        
        try {
          // Process the stream
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log("Stream complete");
              
              // Send final [DONE] marker to client
              res.write(`data: [DONE]\n\n`);
              
              // Update message in database with complete content
              await storage.updateMessage(assistantMessage.id, {
                content: accumulatedContent
              });
              
              break;
            }
            
            // Decode the chunk
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            // Process each line
            for (const line of lines) {
              if (line.trim() === '') continue;
              
              // Handle SSE format (lines starting with "data: ")
              if (line.startsWith('data: ')) {
                const data = line.substring(6);
                
                // Check for [DONE] marker
                if (data === '[DONE]') {
                  continue; // We'll send our own [DONE] when fully complete
                }
                
                try {
                  // Parse the JSON data
                  const jsonData = JSON.parse(data);
                  
                  // Extract content delta
                  const delta = jsonData.choices?.[0]?.delta?.content;
                  
                  if (delta) {
                    // Accumulate content
                    accumulatedContent += delta;
                    
                    // Forward the chunk to the client
                    res.write(`data: ${JSON.stringify({ 
                      id: assistantMessage.id,
                      choices: [{ delta: { content: delta } }]
                    })}\n\n`);
                  }
                } catch (parseError) {
                  console.error("Error parsing streaming chunk:", parseError, "Raw data:", data);
                  // Forward original data to client in case it's a valid format our parser doesn't handle
                  res.write(`${line}\n\n`);
                }
              }
            }
          }
        } catch (streamError) {
          console.error("Error processing stream:", streamError);
          res.write(`event: error\ndata: ${JSON.stringify({ 
            error: "Error processing AI response stream"
          })}\n\n`);
        } finally {
          // Always release the reader lock and end the response
          reader.releaseLock();
          res.end();
        }
      }
      
    } catch (error) {
      console.error("Error in streaming endpoint:", error);
      // If headers haven't been sent yet, send error response
      if (!res.headersSent) {
        res.status(500).json({ message: "Error processing stream" });
      } else {
        // If headers were sent, send error as SSE
        res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream processing error" })}\n\n`);
        res.end();
      }
    }
  });

  // This is the non-streaming endpoint for posting messages.
  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      let { content = "", modelType = "reasoning", modelId = "", image, documentContext = null } = req.body;
      content = content || "";
      if (!content && !image) {
        return res.status(400).json({ message: "Message content or image is required" });
      }
      const user = req.user as Express.User;
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const userDetails = await storage.getUser(user.id);
      if (!userDetails) {
        return res.status(404).json({ message: "User not found" });
      }
      if (userDetails.creditBalance <= 0) {
        return res.status(402).json({
          message: "Insufficient credits. Please purchase more credits to continue.",
          error: "INSUFFICIENT_CREDITS"
        });
      }
      if (image) {
        console.log("Image detected, forcing model type to multimodal");
        modelType = "multimodal";
      }
      if (modelId === "not set") {
        console.error("Invalid modelId received: 'not set'");
        modelId = "";
      }
      if (modelType === "multimodal" && (!modelId || modelId === "")) {
        console.log("Multimodal model selected but no specific modelId provided. Using default multimodal model.");
        modelId = "openai/gpt-4-vision-preview";
      }
      // Always use OpenRouter API
      if (!isOpenRouterKeyValid) {
        return res.status(401).json({ 
          message: "OpenRouter API key is required",
          details: "A valid OpenRouter API key is required to use this endpoint."
        });
      }
      
      // Default to a multimodal model if an image is present and no modelId specified
      if (image && (!modelId || modelId === "")) {
        console.log("Image detected in request, defaulting to GPT-4 Vision");
        modelId = "openai/gpt-4-vision-preview";
      }
      
      // Use the default model if no specific one is provided
      if (!modelId || modelId === "") {
        console.log("No specific modelId provided. Using default OpenRouter model.");
        modelId = DEFAULT_OPENROUTER_CONFIG.modelName;
      }
      
      // Set up model configuration for OpenRouter
      const modelConfig = {
        apiProvider: "openrouter",
        modelName: modelId,
        apiUrl: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: OPENROUTER_API_KEY
      };
      
      console.log(`Using OpenRouter with model: ${modelId}`);
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content: content || "",
        image: image || undefined,
        citations: null
      });
      const previousMessages = await storage.getMessagesByConversation(conversationId);
      let filteredMessages = previousMessages.filter(msg => msg.role === "user" || msg.role === "assistant");
      filteredMessages.sort((a, b) => a.id - b.id);
      let ragContext = documentContext || "";
      if (!ragContext) {
        try {
          const { chunks, documents } = await findSimilarChunks(content, conversationId);
          if (chunks.length > 0) {
            ragContext = formatContextForPrompt(chunks, documents);
            console.log(`Added RAG context from ${chunks.length} document chunks`);
          }
        } catch (error) {
          console.error("Error fetching RAG context:", error);
        }
      } else {
        console.log("Using document context provided by client");
      }
      const messages: ApiMessage[] = [];
      let systemContent = "";
      if (ragContext) {
        systemContent = `You are an AI assistant responding to a user query. Use the following document context provided below to answer the query. Prioritize information found in the context. If the context does not contain the answer, state that.\n\nRelevant Document Context:\n${ragContext}\n\nUse the above document information to answer the query.`;
        if (!(modelType === "multimodal" && image)) {
          messages.push({
            role: "system",
            content: systemContent
          });
        }
      }
      if (modelType === "search") {
        if (filteredMessages.length > 1) {
          const latestMessages = filteredMessages.slice(-2);
          if (latestMessages.length === 2 && latestMessages[0].role === "user" && latestMessages[1].role === "assistant") {
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
        let lastRole = "assistant";
        for (const msg of filteredMessages) {
          if (msg.role !== lastRole) {
            if (modelType === "multimodal" && msg.image) {
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
      if (image) {
        let imageUrl = image;
        if (image.startsWith("data:")) {
          console.log("Using provided data URL for multimodal request");
        } else if (!image.startsWith("http")) {
          if (!image.startsWith("data:image")) {
            imageUrl = `data:image/jpeg;base64,${image}`;
            console.log("Converting base64 to proper data URL format");
          }
        }
        const multimodalMessage: MultimodalMessage = {
          role: "user",
          content: [
            { type: "text", text: content || "" },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        };
        messages.push(multimodalMessage);
      } else {
        messages.push({
          role: "user",
          content: content || ""
        });
      }
      if (!isValidApiKey(modelConfig.apiKey)) {
        console.error(`Invalid or missing API key for ${modelType} model (provider: ${modelConfig.apiProvider})`);
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: `I'm sorry, but the ${modelType} model is not available because the API key is not configured. Please select a different model or contact the administrator.`,
          citations: null
        });
        generateAndSaveConversationTitle(conversationId).catch(err => {
          console.error("Failed to generate conversation title:", err);
        });
        console.log("Sending no-API-key response to client:", {
          assistantMessageId: assistantMessage.id,
          noApiKeyResponseStructure: "assistantMessage only"
        });
        return res.json(assistantMessage);
      }
      try {
        console.log(`Calling ${modelType} API (${modelConfig.apiProvider}) with:`, {
          model: modelConfig.modelName,
          temperature: 0.2,
          top_p: 0.9,
          stream: false,
          messagesCount: messages.length,
          messagesTypes: messages.map(msg => {
            if ("content" in msg && Array.isArray(msg.content)) {
              return "multimodal";
            } else {
              return "text";
            }
          })
        });
        let modelParam;
        if (modelConfig.apiProvider === "openrouter") {
          modelParam = modelId;
          console.log(`OpenRouter request using explicit model ID: ${modelId}`);
        } else {
          modelParam = modelConfig.modelName;
        }
        const cleanMessages = modelConfig.apiProvider === "openrouter"
          ? messages.map(msg => {
              if (typeof msg.content === "string") {
                return {
                  role: msg.role,
                  content: msg.content
                };
              }
              if (Array.isArray(msg.content)) {
                return {
                  role: msg.role,
                  content: msg.content.map(item => {
                    if (item.type === "text") {
                      return { type: "text", text: item.text };
                    } else if (item.type === "image_url") {
                      return { type: "image_url", image_url: { url: item.image_url.url } };
                    }
                    return item;
                  })
                };
              }
              return msg;
            })
          : messages;
        if (modelConfig.apiProvider === "openrouter") {
          console.log("Created clean messages for OpenRouter API");
          const firstMsg = cleanMessages[0];
          const lastMsg = cleanMessages[cleanMessages.length - 1];
          console.log("OpenRouter message format check:", {
            messageCount: cleanMessages.length,
            firstMessageRole: firstMsg?.role,
            firstMessageContentType: typeof firstMsg?.content,
            lastMessageRole: lastMsg?.role,
            lastMessageContentType: typeof lastMsg?.content,
            isLastMessageMultimodal: Array.isArray(lastMsg?.content)
          });
        }
        const payload = {
          model: modelParam,
          messages: cleanMessages,
          temperature: 0.2,
          top_p: 0.9,
          stream: false
        };
        console.log("API request with model parameter:", {
          apiProvider: modelConfig.apiProvider,
          modelParameter: payload.model,
          originalModelId: modelId,
          isOpenRouter: modelConfig.apiProvider === "openrouter"
        });
        // --- Fix: Ensure the try block is properly closed by wrapping the abort logic ---
        try {
          const abortController = new AbortController();
          setTimeout(() => abortController.abort(), 60000);
        } catch (abortError) {
          console.error("Error setting up abort logic for non-streaming API call:", abortError);
        }
        // -------------------------------------------------------------------------------
        const apiResponse = await fetch(modelConfig.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${modelConfig.apiKey}`
          },
          body: JSON.stringify(payload)
        });
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`${modelConfig.apiProvider} API error: ${errorText}`);
          throw new Error(`${modelConfig.apiProvider} API returned an error: ${apiResponse.status}`);
        }
        const assistantMessageData = await apiResponse.json();
        const assistantMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: assistantMessageData.choices?.[0]?.message?.content || "",
          citations: null
        });
        if ((await storage.getConversation(conversationId))?.title === "New Conversation") {
          generateAndSaveConversationTitle(conversationId).catch(err => {
            console.error("Failed to generate conversation title:", err);
          });
        }
        return res.json(assistantMessage);
      } catch (apiError) {
        console.error("Error calling AI API:", apiError);
        return res.status(500).json({
          message: "Failed to process message",
          error: apiError instanceof Error ? apiError.message : String(apiError)
        });
      }
    } catch (error) {
      console.error("Error in non-streaming message endpoint:", error);
      res.status(500).json({ message: "Error processing message" });
    }
  });
  // === End of POST /api/conversations/:id/messages endpoint fix ===

  const server = createServer(app);
  return server;
}
