import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, decimal } from "drizzle-orm/pg-core";
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

// Credit transaction types
export const TRANSACTION_TYPES = {
  PURCHASE: "purchase",
  USAGE: "usage",
  REFUND: "refund",
  BONUS: "bonus",
} as const;

// Credit transactions schema for tracking credit changes
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'purchase', 'usage', 'refund', 'bonus'
  amount: integer("amount").notNull(), // positive for purchase/bonus, negative for usage
  paypalOrderId: text("paypal_order_id"), // for purchases via PayPal
  modelId: text("model_id"), // for tracking which model was used (for usage transactions)
  promptTokens: integer("prompt_tokens"), // number of prompt tokens used (for usage transactions)
  completionTokens: integer("completion_tokens"), // number of completion tokens used (for usage transactions)
  baseAmount: decimal("base_amount", { precision: 10, scale: 6 }), // base amount in USD without markup
  description: text("description"), // additional details about the transaction
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  userId: true,
  type: true,
  amount: true,
  paypalOrderId: true,
  modelId: true,
  promptTokens: true,
  completionTokens: true,
  baseAmount: true,
  description: true,
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  image: true,
  citations: true,
});

// Credit package definitions for PayPal purchases
export const CREDIT_PACKAGES = [
  { id: 'basic', name: 'Basic Package', credits: 50000, price: 5.00, currency: 'USD' },
  { id: 'standard', name: 'Standard Package', credits: 110000, price: 10.00, currency: 'USD' },
  { id: 'premium', name: 'Premium Package', credits: 275000, price: 20.00, currency: 'USD' },
];

// Credit to USD conversion rate (10,000 credits = $1.00)
export const CREDITS_PER_USD = 10000;
export const USD_PER_CREDIT = 1 / CREDITS_PER_USD; // $0.0001 per credit

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];
export type CreditPackage = typeof CREDIT_PACKAGES[number];
