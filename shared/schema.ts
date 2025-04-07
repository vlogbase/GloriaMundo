import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema updated for Google authentication and model presets
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
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

// Payment transaction schema for tracking payment history
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  paypalOrderId: text("paypal_order_id"),
  paypalCaptureId: text("paypal_capture_id"),
  packageId: text("package_id"), // Which package or 'custom'
  amount: integer("amount").notNull(), // Amount in cents
  fee: integer("fee").notNull(), // Fee in cents
  credits: integer("credits").notNull(), // Credits added (hundredths of cents)
  status: text("status").notNull(), // 'completed', 'pending', 'failed'
  metadata: jsonb("metadata"), // Additional transaction data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).pick({
  userId: true,
  paypalOrderId: true,
  paypalCaptureId: true,
  packageId: true,
  amount: true,
  fee: true,
  credits: true,
  status: true,
  metadata: true,
});

// Usage log schema for tracking detailed usage
export const usageLogs = pgTable("usage_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  messageId: integer("message_id").references(() => messages.id),
  modelId: text("model_id").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(), 
  imageCount: integer("image_count").default(0).notNull(), // Number of images processed
  creditsUsed: integer("credits_used").notNull(), // Cost in hundredths of cents
  metadata: jsonb("metadata"), // Additional usage data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUsageLogSchema = createInsertSchema(usageLogs).pick({
  userId: true,
  messageId: true,
  modelId: true,
  promptTokens: true,
  completionTokens: true,
  imageCount: true,
  creditsUsed: true,
  metadata: true,
});

// User notification preferences
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).unique().notNull(),
  lowBalanceThreshold: integer("low_balance_threshold").default(5000), // 50 cents in hundredths of cents
  emailNotificationsEnabled: boolean("email_notifications_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).pick({
  userId: true,
  lowBalanceThreshold: true,
  emailNotificationsEnabled: true,
});

// Export types for documents
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;
export type DocumentChunk = typeof documentChunks.$inferSelect;

// Export types for payments and usage
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;
export type UsageLog = typeof usageLogs.$inferSelect;

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

// Content description schema for storing multimedia content metadata and descriptions
export const imageDescriptions = pgTable("image_descriptions", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  imageIdentifier: text("image_identifier").notNull(), // URL or path to the content file (kept for DB compatibility)
  textDescription: text("text_description").notNull(), // AI-generated description of the content
  mimeType: text("mime_type").notNull(), // MIME type of the content
  fileSize: integer("file_size").notNull(), // Size in bytes
  type: text("type").default("content_description").notNull(), // Distinguishes from text chunks
  embedding: text("embedding"), // Vector embedding of the description
  metadata: jsonb("metadata"), // Additional metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // When the content expires (if set)
});

export const insertImageDescriptionSchema = createInsertSchema(imageDescriptions).pick({
  conversationId: true,
  userId: true,
  imageIdentifier: true,
  textDescription: true,
  mimeType: true,
  fileSize: true,
  type: true,
  embedding: true,
  metadata: true,
  expiresAt: true,
});

// Export types for content descriptions (keeping ImageDescription name for compatibility)
export type InsertImageDescription = z.infer<typeof insertImageDescriptionSchema>;
export type ImageDescription = typeof imageDescriptions.$inferSelect;
