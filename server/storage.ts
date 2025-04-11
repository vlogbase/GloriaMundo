import { 
  users, type User, type InsertUser, 
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  documents, type Document, type InsertDocument,
  documentChunks, type DocumentChunk, type InsertDocumentChunk,
  usageLogs, type UsageLog, type InsertUsageLog,
  payments, type Payment, type InsertPayment
} from "@shared/schema";
import { db } from "./db";
import { eq, and, asc, inArray, isNull, sql } from "drizzle-orm";

// Define the user presets interface
export interface UserPresets {
  preset1ModelId: string | null;
  preset2ModelId: string | null;
  preset3ModelId: string | null;
  preset4ModelId: string | null;
  preset5ModelId: string | null;
  preset6ModelId: string | null; // Added preset6 for FREE tier
}

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User | undefined>;
  getUserPresets(userId: number): Promise<UserPresets | undefined>;
  updateUserPresets(userId: number, presets: Partial<UserPresets>): Promise<UserPresets | undefined>;

  // Conversation methods
  getConversation(id: number): Promise<Conversation | undefined>;
  getUserConversations(userId: number): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, conversation: Partial<Conversation>): Promise<Conversation | undefined>;
  deleteConversation(id: number): Promise<void>;

  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  getConversationMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, message: Partial<Message>): Promise<Message | undefined>;
  deleteMessage(id: number): Promise<void>;

  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getConversationDocuments(conversationId: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, document: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;

  // Document chunk methods
  getDocumentChunk(id: number): Promise<DocumentChunk | undefined>;
  getDocumentChunks(documentId: number): Promise<DocumentChunk[]>;
  createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk>;
  createDocumentChunks(chunks: InsertDocumentChunk[]): Promise<DocumentChunk[]>;
  
  // Usage logs methods
  createUsageLog(log: InsertUsageLog): Promise<UsageLog>;
  getUserUsageLogs(userId: number, limit?: number): Promise<UsageLog[]>;
  
  // Payment methods
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: number, payment: Partial<Payment>): Promise<Payment | undefined>;
  getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined>;
}

export class PostgresStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.getUserById(id);
  }

  async getUserById(id: number): Promise<User | undefined> {
    const users = await db.query.users.findMany({
      where: eq(users.id, id),
      limit: 1,
    });
    return users.length > 0 ? users[0] : undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const users = await db.query.users.findMany({
      where: eq(users.googleId, googleId),
      limit: 1,
    });
    return users.length > 0 ? users[0] : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const users = await db.query.users.findMany({
      where: eq(users.name, username),
      limit: 1,
    });
    return users.length > 0 ? users[0] : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  async updateUser(id: number, user: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  async getUserPresets(userId: number): Promise<UserPresets | undefined> {
    const user = await db.query.users.findFirst({
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
    
    return user;
  }
  
  async updateUserPresets(userId: number, presets: Partial<UserPresets>): Promise<UserPresets | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...presets, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        preset1ModelId: users.preset1ModelId,
        preset2ModelId: users.preset2ModelId,
        preset3ModelId: users.preset3ModelId,
        preset4ModelId: users.preset4ModelId,
        preset5ModelId: users.preset5ModelId,
        preset6ModelId: users.preset6ModelId
      });
      
    return updatedUser;
  }

  // Conversation methods
  async getConversation(id: number): Promise<Conversation | undefined> {
    const conversations = await db.query.conversations.findMany({
      where: eq(conversations.id, id),
      limit: 1,
    });
    return conversations.length > 0 ? conversations[0] : undefined;
  }

  async getUserConversations(userId: number): Promise<Conversation[]> {
    return await db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: [asc(conversations.createdAt)],
    });
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [createdConversation] = await db
      .insert(conversations)
      .values(conversation)
      .returning();
    return createdConversation;
  }

  async updateConversation(
    id: number,
    conversation: Partial<Conversation>
  ): Promise<Conversation | undefined> {
    const [updatedConversation] = await db
      .update(conversations)
      .set({ ...conversation, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updatedConversation;
  }

  async deleteConversation(id: number): Promise<void> {
    // First delete all messages that belong to this conversation
    await db.delete(messages).where(eq(messages.conversationId, id));
    // Then delete the conversation itself
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    const messages = await db.query.messages.findMany({
      where: eq(messages.id, id),
      limit: 1,
    });
    return messages.length > 0 ? messages[0] : undefined;
  }

  async getConversationMessages(conversationId: number): Promise<Message[]> {
    return await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
    });
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [createdMessage] = await db.insert(messages).values(message).returning();
    return createdMessage;
  }

  async updateMessage(id: number, message: Partial<Message>): Promise<Message | undefined> {
    const [updatedMessage] = await db
      .update(messages)
      .set(message)
      .where(eq(messages.id, id))
      .returning();
    return updatedMessage;
  }

  async deleteMessage(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }
  
  // Document methods
  async getDocument(id: number): Promise<Document | undefined> {
    const docs = await db.query.documents.findMany({
      where: eq(documents.id, id),
      limit: 1,
    });
    return docs.length > 0 ? docs[0] : undefined;
  }

  async getConversationDocuments(conversationId: number): Promise<Document[]> {
    return await db.query.documents.findMany({
      where: eq(documents.conversationId, conversationId),
      orderBy: [asc(documents.createdAt)],
    });
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [createdDocument] = await db.insert(documents).values(document).returning();
    return createdDocument;
  }

  async updateDocument(id: number, document: Partial<Document>): Promise<Document | undefined> {
    const [updatedDocument] = await db
      .update(documents)
      .set(document)
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
  }

  async deleteDocument(id: number): Promise<void> {
    // First delete all chunks that belong to this document
    await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
    // Then delete the document itself
    await db.delete(documents).where(eq(documents.id, id));
  }
  
  // Document chunk methods
  async getDocumentChunk(id: number): Promise<DocumentChunk | undefined> {
    const chunks = await db.query.documentChunks.findMany({
      where: eq(documentChunks.id, id),
      limit: 1,
    });
    return chunks.length > 0 ? chunks[0] : undefined;
  }

  async getDocumentChunks(documentId: number): Promise<DocumentChunk[]> {
    return await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, documentId),
      orderBy: [asc(documentChunks.createdAt)],
    });
  }

  async createDocumentChunk(chunk: InsertDocumentChunk): Promise<DocumentChunk> {
    const [createdChunk] = await db.insert(documentChunks).values(chunk).returning();
    return createdChunk;
  }
  
  async createDocumentChunks(chunks: InsertDocumentChunk[]): Promise<DocumentChunk[]> {
    if (chunks.length === 0) return [];
    const createdChunks = await db.insert(documentChunks).values(chunks).returning();
    return createdChunks;
  }
  
  // Usage logs methods
  async createUsageLog(log: InsertUsageLog): Promise<UsageLog> {
    const [createdLog] = await db.insert(usageLogs).values(log).returning();
    return createdLog;
  }
  
  async getUserUsageLogs(userId: number, limit?: number): Promise<UsageLog[]> {
    return await db.query.usageLogs.findMany({
      where: eq(usageLogs.userId, userId),
      orderBy: [asc(usageLogs.createdAt)],
      limit: limit || 100
    });
  }
  
  // Payment methods
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [createdPayment] = await db.insert(payments).values(payment).returning();
    return createdPayment;
  }
  
  async updatePayment(id: number, payment: Partial<Payment>): Promise<Payment | undefined> {
    const [updatedPayment] = await db
      .update(payments)
      .set({ ...payment, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return updatedPayment;
  }
  
  async getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined> {
    const payments = await db.query.payments.findMany({
      where: eq(payments.transactionId, transactionId),
      limit: 1,
    });
    return payments.length > 0 ? payments[0] : undefined;
  }
}

// Export singleton instance
export const storage = new PostgresStorage();