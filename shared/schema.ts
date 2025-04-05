import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema updated for Google authentication and model presets
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").unique(),
  email: text("email").unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  creditBalance: integer("credit_balance").default(0).notNull(),
  // Model preset fields - storing model IDs for each preset slot
  preset1ModelId: text("preset1_model_id"),
  preset2ModelId: text("preset2_model_id"),
  preset3ModelId: text("preset3_model_id"),
  preset4ModelId: text("preset4_model_id"),
  preset5ModelId: text("preset5_model_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  googleId: true,
  email: true,
  name: true,
  avatarUrl: true,
});

// Conversation schema for chat history
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  title: true,
});

// Message schema for individual messages in conversations
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  image: text("image"), // Store base64 encoded image data for multimodal messages
  citations: jsonb("citations"), // Store API citation data
  modelId: text("model_id"), // Store the model ID used for this message
  promptTokens: integer("prompt_tokens"), // Number of tokens in the prompt
  completionTokens: integer("completion_tokens"), // Number of tokens in the completion
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  image: true,
  citations: true,
  modelId: true,
  promptTokens: true,
  completionTokens: true,
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Document schema for storing uploaded documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // MIME type
  fileSize: integer("file_size").notNull(), // in bytes
  content: text("content").notNull(), // The extracted text content
  metadata: jsonb("metadata"), // Additional metadata about the document
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  conversationId: true,
  userId: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  content: true,
  metadata: true,
});

// Document chunk schema for storing smaller chunks of documents for retrieval
export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  content: text("content").notNull(), // The chunk text content
  chunkIndex: integer("chunk_index").notNull(), // Position in the document
  embedding: text("embedding"), // The embedding vector as a string (to be converted to array)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocumentChunkSchema = createInsertSchema(documentChunks).pick({
  documentId: true,
  content: true,
  chunkIndex: true,
  embedding: true,
});

// Export types for documents
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;
