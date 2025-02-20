import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { authMiddleware } from "./middleware/auth";
import { getChatCompletion, type ChatMessage } from "./services/search1api";
import { generateEmbedding, findSimilarMessages } from "./services/embeddings";
import { insertChatSchema, insertMessageSchema } from "@shared/schema";
import { ZodError } from "zod";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Auth middleware for all /api routes
  app.use("/api", authMiddleware);

  // Chat routes
  app.post("/api/chats", async (req, res) => {
    try {
      const result = insertChatSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Convert string ID to number for database storage
      const userId = typeof req.user!.id === 'string' ? parseInt(req.user!.id) : req.user!.id;

      const chat = await storage.createChat({
        ...result.data,
        user_id: userId,
      });
      res.json(chat);
    } catch (error) {
      console.error("Create chat error:", error);
      res.status(500).json({ error: "Failed to create chat" });
    }
  });

  app.get("/api/chats", async (req, res) => {
    try {
      const userId = typeof req.user!.id === 'string' ? parseInt(req.user!.id) : req.user!.id;
      const chats = await storage.getChatsForUser(userId);
      res.json(chats);
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  });

  // Message routes
  app.post("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const result = insertMessageSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      const chatId = parseInt(req.params.chatId);
      const userId = typeof req.user!.id === 'string' ? parseInt(req.user!.id) : req.user!.id;
      const embedding = await generateEmbedding(result.data.content);

      // Get similar messages for context
      const similarMessages = await findSimilarMessages(result.data.content, chatId);

      // Create user message
      const message = await storage.createMessage({
        ...result.data,
        chat_id: chatId,
        user_id: userId,
        embedding,
      });

      // Format similar messages for the chat completion
      const chatHistory: ChatMessage[] = similarMessages.map(msg => ({
        role: "user" as const,
        content: msg.content,
      }));

      // Get chat completion with context
      const completion = await getChatCompletion([
        ...chatHistory,
        { role: "user" as const, content: result.data.content }
      ]);

      // Create assistant message
      const assistantMessage = await storage.createMessage({
        chat_id: chatId,
        user_id: userId,
        content: completion.choices[0].message.content,
        role: "assistant",
        embedding: await generateEmbedding(completion.choices[0].message.content),
      });

      res.json({ message, assistantMessage });
    } catch (error) {
      console.error("Create message error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const messages = await storage.getMessagesForChat(chatId);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  return httpServer;
}