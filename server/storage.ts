import { 
  users, type User, type InsertUser, 
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  documents, type Document, type InsertDocument,
  documentChunks, type DocumentChunk, type InsertDocumentChunk,
  paymentTransactions, type PaymentTransaction, type InsertPaymentTransaction,
  usageLogs, type UsageLog, type InsertUsageLog,
  userSettings, type UserSettings, type InsertUserSettings,
  imageDescriptions, type ImageDescription, type InsertImageDescription
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
}

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserPresets(userId: number): Promise<UserPresets>;
  updateUserPresets(userId: number, presets: UserPresets): Promise<UserPresets>;
  addUserCredits(userId: number, credits: number): Promise<User>;
  deductUserCredits(userId: number, credits: number): Promise<User>;
  
  // Conversation methods
  getConversations(): Promise<Conversation[]>;
  getConversationsByUserId(userId: number): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conversation: Partial<InsertConversation>): Promise<Conversation>;
  updateConversationTitle(id: number, title: string): Promise<Conversation | undefined>;
  deleteConversation(id: number): Promise<void>;
  clearConversations(): Promise<void>;
  
  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  getFirstUserMessage(conversationId: number): Promise<Message | undefined>;
  createMessage(message: Partial<InsertMessage>): Promise<Message>;
  updateMessage(id: number, updates: Partial<InsertMessage>): Promise<Message | undefined>;
  
  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentById(id: number): Promise<Document | undefined>; // Alias for getDocument
  getDocumentsByConversation(conversationId: number): Promise<Document[]>;
  createDocument(document: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  updateDocument(id: number, data: Partial<Document>): Promise<Document | undefined>;
  updateDocumentMetadata(id: number, metadata: any): Promise<Document | undefined>;
  
  // Document chunk methods
  getDocumentChunk(id: number): Promise<DocumentChunk | undefined>;
  getChunksByDocument(documentId: number): Promise<DocumentChunk[]>;
  createDocumentChunk(chunk: Partial<InsertDocumentChunk>): Promise<DocumentChunk>;
  updateDocumentChunkEmbedding(id: number, embedding: string): Promise<DocumentChunk | undefined>;
  searchSimilarChunks(embedding: string, limit?: number): Promise<DocumentChunk[]>;
  
  // Payment transaction methods
  createPaymentTransaction(transaction: Partial<InsertPaymentTransaction>): Promise<PaymentTransaction>;
  getPaymentTransactionsByUserId(userId: number): Promise<PaymentTransaction[]>;
  getPaymentTransactionById(id: number): Promise<PaymentTransaction | undefined>;
  updatePaymentTransactionStatus(id: number, status: string): Promise<PaymentTransaction | undefined>;
  
  // Usage log methods
  createUsageLog(log: Partial<InsertUsageLog>): Promise<UsageLog>;
  getUsageLogsByUserId(userId: number): Promise<UsageLog[]>;
  getUsageLogsByTimeRange(userId: number, startDate: Date, endDate: Date): Promise<UsageLog[]>;
  getUsageStatsByModel(userId: number, startDate: Date, endDate: Date): Promise<{modelId: string, totalCredits: number, totalTokens: number}[]>;
  
  // User settings methods
  getUserSettings(userId: number): Promise<UserSettings | undefined>;
  createOrUpdateUserSettings(settings: Partial<InsertUserSettings>): Promise<UserSettings>;
  
  // Content description methods (handles images, video, audio, and other media)
  getContentDescription(id: number): Promise<ImageDescription | undefined>;
  getContentByConversation(conversationId: number): Promise<ImageDescription[]>;
  createContentDescription(contentDescription: Partial<InsertImageDescription>): Promise<ImageDescription>;
  updateContentDescription(id: number, updates: Partial<InsertImageDescription>): Promise<ImageDescription | undefined>;
  deleteContentDescription(id: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  private documents: Map<number, Document>;
  private documentChunks: Map<number, DocumentChunk>;
  private imageDescriptions: Map<number, ImageDescription>; // Kept name for backwards compatibility
  
  private userId: number;
  private conversationId: number;
  private messageId: number;
  private documentId: number;
  private documentChunkId: number;
  private imageDescriptionId: number; // ID for content descriptions (kept for compatibility)

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.documents = new Map();
    this.documentChunks = new Map();
    this.imageDescriptions = new Map();
    
    this.userId = 1;
    this.conversationId = 1;
    this.messageId = 1;
    this.documentId = 1;
    this.documentChunkId = 1;
    this.imageDescriptionId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    // First try to get user from DB
    try {
      const userFromDb = await db.select().from(users).where(eq(users.id, id)).limit(1);
      
      if (userFromDb.length > 0) {
        // User exists in the database
        return userFromDb[0];
      }
    } catch (error) {
      console.error('Database error when getting user:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // First try to get user from DB
    try {
      const userFromDb = await db.select().from(users).where(eq(users.email, username)).limit(1);
      
      if (userFromDb.length > 0) {
        // User exists in the database
        return userFromDb[0];
      }
    } catch (error) {
      console.error('Database error when getting user by username:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return Array.from(this.users.values()).find(
      (user) => user.email === username,
    );
  }
  
  async getUserById(id: number): Promise<User | undefined> {
    // This is an alias for getUser() for API consistency
    return this.getUser(id);
  }
  
  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    // First try to get user from DB
    try {
      const userFromDb = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
      
      if (userFromDb.length > 0) {
        // User exists in the database
        return userFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting user by Google ID ${googleId}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    return Array.from(this.users.values()).find(
      (user) => user.googleId === googleId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    
    const user: User = {
      id,
      googleId: insertUser.googleId || "",
      email: insertUser.email || "",
      name: insertUser.name || "",
      avatarUrl: insertUser.avatarUrl || "",
      creditBalance: 0,
      preset1ModelId: null,
      preset2ModelId: null,
      preset3ModelId: null,
      preset4ModelId: null,
      preset5ModelId: null,
      createdAt: now,
      updatedAt: now
    };
    
    this.users.set(id, user);
    return user;
  }
  
  // User preset methods
  async getUserPresets(userId: number): Promise<UserPresets> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    return {
      preset1ModelId: user.preset1ModelId || null,
      preset2ModelId: user.preset2ModelId || null,
      preset3ModelId: user.preset3ModelId || null,
      preset4ModelId: user.preset4ModelId || null,
      preset5ModelId: user.preset5ModelId || null
    };
  }
  
  async updateUserPresets(userId: number, presets: UserPresets): Promise<UserPresets> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    const updatedUser = {
      ...user,
      preset1ModelId: presets.preset1ModelId,
      preset2ModelId: presets.preset2ModelId,
      preset3ModelId: presets.preset3ModelId,
      preset4ModelId: presets.preset4ModelId,
      preset5ModelId: presets.preset5ModelId,
      updatedAt: new Date()
    };
    
    this.users.set(userId, updatedUser);
    
    return {
      preset1ModelId: updatedUser.preset1ModelId,
      preset2ModelId: updatedUser.preset2ModelId,
      preset3ModelId: updatedUser.preset3ModelId,
      preset4ModelId: updatedUser.preset4ModelId,
      preset5ModelId: updatedUser.preset5ModelId
    };
  }
  
  /**
   * Add credits to a user's balance
   */
  async addUserCredits(userId: number, credits: number): Promise<User> {
    // First try to get user from DB
    try {
      const userFromDb = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (userFromDb.length > 0) {
        // User exists in the database
        if (credits < 0) {
          throw new Error("Cannot add negative credits");
        }
        
        // Update user in the database
        const newBalance = userFromDb[0].creditBalance + credits;
        await db.update(users)
          .set({ 
            creditBalance: newBalance,
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));
        
        // Get updated user
        const updatedUserFromDb = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (updatedUserFromDb.length > 0) {
          console.log(`Added ${credits} credits to user ${userId} in database. New balance: ${updatedUserFromDb[0].creditBalance}`);
          return updatedUserFromDb[0];
        }
      }
    } catch (error) {
      console.error('Database error when adding credits:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    const user = await this.getUser(userId);
    
    if (!user) {
      throw new Error("User not found");
    }
    
    if (credits < 0) {
      throw new Error("Cannot add negative credits");
    }
    
    const updatedUser = {
      ...user,
      creditBalance: user.creditBalance + credits,
      updatedAt: new Date()
    };
    
    this.users.set(userId, updatedUser);
    console.log(`Added ${credits} credits to user ${userId} in memory. New balance: ${updatedUser.creditBalance}`);
    
    return updatedUser;
  }
  
  /**
   * Deduct credits from a user's balance
   */
  async deductUserCredits(userId: number, credits: number): Promise<User> {
    // First try to get user from DB
    try {
      const userFromDb = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (userFromDb.length > 0) {
        // User exists in the database
        if (credits < 0) {
          throw new Error("Cannot deduct negative credits");
        }
        
        if (userFromDb[0].creditBalance < credits) {
          throw new Error("Insufficient credits");
        }
        
        // Update user in the database
        const newBalance = userFromDb[0].creditBalance - credits;
        await db.update(users)
          .set({ 
            creditBalance: newBalance,
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));
        
        // Get updated user
        const updatedUserFromDb = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (updatedUserFromDb.length > 0) {
          console.log(`Deducted ${credits} credits from user ${userId} in database. New balance: ${updatedUserFromDb[0].creditBalance}`);
          return updatedUserFromDb[0];
        }
      }
    } catch (error) {
      console.error('Database error when deducting credits:', error);
      // If the error is about insufficient credits, rethrow it to maintain the intended behavior
      if (error instanceof Error && error.message === "Insufficient credits") {
        throw error;
      }
    }
    
    // Fallback to in-memory storage if DB fails
    const user = await this.getUser(userId);
    
    if (!user) {
      throw new Error("User not found");
    }
    
    if (credits < 0) {
      throw new Error("Cannot deduct negative credits");
    }
    
    if (user.creditBalance < credits) {
      throw new Error("Insufficient credits");
    }
    
    const updatedUser = {
      ...user,
      creditBalance: user.creditBalance - credits,
      updatedAt: new Date()
    };
    
    this.users.set(userId, updatedUser);
    console.log(`Deducted ${credits} credits from user ${userId} in memory. New balance: ${updatedUser.creditBalance}`);
    
    return updatedUser;
  }
  
  // Conversation methods
  async getConversations(): Promise<Conversation[]> {
    // Try getting conversations from database first
    try {
      const conversationsFromDb = await db.select().from(conversations).orderBy(conversations.updatedAt);
      
      if (conversationsFromDb.length > 0) {
        // Sort conversations by updated date in descending order
        return conversationsFromDb.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
    } catch (error) {
      console.error('Database error when getting all conversations:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    // Sort conversations by updated date in descending order
    return Array.from(this.conversations.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  
  async getConversationsByUserId(userId: number): Promise<Conversation[]> {
    // Try getting conversations from database first
    try {
      const conversationsFromDb = await db.select().from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(conversations.updatedAt);
      
      if (conversationsFromDb.length > 0) {
        // Sort conversations by updated date in descending order
        return conversationsFromDb.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
    } catch (error) {
      console.error(`Database error when getting conversations for user ${userId}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    // Filter by userId and sort by updated date in descending order
    return Array.from(this.conversations.values())
      .filter(conversation => conversation.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  
  async getConversation(id: number): Promise<Conversation | undefined> {
    // Try getting conversation from database first
    try {
      const conversationFromDb = await db.select().from(conversations)
        .where(eq(conversations.id, id))
        .limit(1);
      
      if (conversationFromDb.length > 0) {
        return conversationFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting conversation ${id}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    return this.conversations.get(id);
  }
  
  async createConversation(data: Partial<InsertConversation>): Promise<Conversation> {
    const now = new Date();
    const title = data.title ?? "New Conversation";
    
    // Try to create conversation in database first
    try {
      const result = await db.insert(conversations)
        .values({
          userId: data.userId ?? null,
          title: title,
          createdAt: now,
          updatedAt: now
        })
        .returning();
      
      if (result.length > 0) {
        console.log('Created conversation in database:', result[0]);
        return result[0];
      }
    } catch (error) {
      console.error('Database error when creating conversation:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    const id = this.conversationId++;
    
    const conversation: Conversation = {
      id,
      userId: data.userId ?? null,
      title: title,
      createdAt: now,
      updatedAt: now
    };
    
    this.conversations.set(id, conversation);
    console.log('Created conversation in memory:', conversation);
    return conversation;
  }
  
  async updateConversationTitle(id: number, title: string): Promise<Conversation | undefined> {
    const now = new Date();
    
    // Try to update in database first
    try {
      const conversationFromDb = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      
      if (conversationFromDb.length > 0) {
        // Update in database
        const result = await db.update(conversations)
          .set({ 
            title,
            updatedAt: now
          })
          .where(eq(conversations.id, id))
          .returning();
        
        if (result.length > 0) {
          console.log(`Updated conversation ${id} title in database to "${title}"`);
          return result[0];
        }
      }
    } catch (error) {
      console.error(`Database error when updating conversation ${id} title:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    const conversation = this.conversations.get(id);
    
    if (!conversation) {
      return undefined;
    }
    
    const updated = {
      ...conversation,
      title,
      updatedAt: now
    };
    
    this.conversations.set(id, updated);
    console.log(`Updated conversation ${id} title in memory to "${title}"`);
    return updated;
  }
  
  async deleteConversation(id: number): Promise<void> {
    // Try to delete from database first
    try {
      // First, delete related messages
      await db.delete(messages)
        .where(eq(messages.conversationId, id))
        .execute();
        
      // Then delete the conversation
      await db.delete(conversations)
        .where(eq(conversations.id, id))
        .execute();
        
      console.log(`Deleted conversation ${id} and its messages from database`);
    } catch (error) {
      console.error(`Database error when deleting conversation ${id}:`, error);
    }
    
    // Also remove from memory storage as a fallback
    // Delete the conversation
    this.conversations.delete(id);
    
    // Delete all associated messages
    const messageIds = Array.from(this.messages.entries())
      .filter(([_, msg]) => msg.conversationId === id)
      .map(([id, _]) => id);
    
    for (const messageId of messageIds) {
      this.messages.delete(messageId);
    }
    
    console.log(`Deleted conversation ${id} from memory storage`);
  }
  
  async clearConversations(): Promise<void> {
    // Only clear anonymous conversations for now to avoid data loss
    // This is a safety measure since this method is typically used for cleanup
    try {
      // Get all conversations
      const allConversations = await db.select().from(conversations);
      
      // Filter to just find anonymous conversations (userId is null)
      const anonymousConversations = allConversations.filter(conv => conv.userId === null);
        
      if (anonymousConversations.length > 0) {
        const anonymousConvIds = anonymousConversations.map(conv => conv.id);
        
        // Delete all messages belonging to anonymous conversations
        for (const convId of anonymousConvIds) {
          await db.delete(messages)
            .where(eq(messages.conversationId, convId))
            .execute();
        }
        
        // Delete all anonymous conversations
        for (const convId of anonymousConvIds) {
          await db.delete(conversations)
            .where(eq(conversations.id, convId))
            .execute();
        }
        
        console.log(`Cleared ${anonymousConversations.length} anonymous conversations from database`);
      }
    } catch (error) {
      console.error('Database error when clearing conversations:', error);
    }
    
    // Clear in-memory storage too
    this.conversations.clear();
    this.messages.clear();
    console.log('Cleared all conversations from memory storage');
  }
  
  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    // Try database first
    try {
      const messageFromDb = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      
      if (messageFromDb.length > 0) {
        return messageFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting message ${id}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    return this.messages.get(id);
  }
  
  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    // Try database first
    try {
      const messagesFromDb = await db.select().from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt));
      
      if (messagesFromDb.length > 0) {
        console.log(`Retrieved ${messagesFromDb.length} messages for conversation ${conversationId} from database`);
        return messagesFromDb;
      }
    } catch (error) {
      console.error(`Database error when getting messages for conversation ${conversationId}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    console.log(`Falling back to in-memory storage for messages in conversation ${conversationId}`);
    return Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  
  async getFirstUserMessage(conversationId: number): Promise<Message | undefined> {
    // Try to get the first user message from database
    try {
      const userMessagesFromDb = await db.select().from(messages)
        .where(and(
          eq(messages.conversationId, conversationId),
          eq(messages.role, 'user')
        ))
        .orderBy(asc(messages.createdAt))
        .limit(1);
      
      if (userMessagesFromDb.length > 0) {
        console.log(`Retrieved first user message for conversation ${conversationId} from database`);
        return userMessagesFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting first user message for conversation ${conversationId}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    console.log(`Falling back to in-memory storage for first user message in conversation ${conversationId}`);
    return Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId && msg.role === 'user')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  }
  
  async createMessage(data: Partial<InsertMessage>): Promise<Message> {
    if (!data.conversationId) {
      throw new Error("conversationId is required");
    }
    
    if (!data.role) {
      throw new Error("role is required");
    }
    
    // Modified check: allow empty string content ("") but not undefined/null content without image
    if ((data.content === undefined || data.content === null) && !data.image) {
      throw new Error("Either content or image is required");
    }
    
    const now = new Date();
    
    // Try to create message in database first
    try {
      // Include all fields from the schema since we've added the missing columns
      const result = await db.insert(messages)
        .values({
          conversationId: data.conversationId,
          role: data.role,
          content: data.content || "", // Default to empty string if only image is provided
          image: data.image || null,
          citations: data.citations ?? null,
          modelId: data.modelId || null,
          promptTokens: data.promptTokens || null,
          completionTokens: data.completionTokens || null,
          createdAt: now
        })
        .returning();
      
      if (result.length > 0) {
        console.log(`Created message in database for conversation ${data.conversationId}`);
        
        // Update the conversation's updatedAt timestamp in the database
        await db.update(conversations)
          .set({ updatedAt: now })
          .where(eq(conversations.id, data.conversationId));
        
        return result[0];
      }
    } catch (error) {
      console.error('Database error when creating message:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    const id = this.messageId++;
    
    const message: Message = {
      id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content || "", // Default to empty string if only image is provided
      image: data.image || null,
      citations: data.citations ?? null,
      modelId: data.modelId || null,
      promptTokens: data.promptTokens || null,
      completionTokens: data.completionTokens || null,
      createdAt: now
    };
    
    this.messages.set(id, message);
    console.log(`Created message in memory for conversation ${data.conversationId}`);
    
    // Update the conversation's updatedAt timestamp
    const conversation = this.conversations.get(data.conversationId);
    if (conversation) {
      this.conversations.set(data.conversationId, {
        ...conversation,
        updatedAt: now
      });
    }
    
    return message;
  }
  
  async updateMessage(id: number, updates: Partial<InsertMessage>): Promise<Message | undefined> {
    // Try to update in database first
    try {
      // Get the existing message from DB
      const messageFromDb = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      
      if (messageFromDb.length > 0) {
        const existingMessage = messageFromDb[0];
        
        // Prepare the updates
        const updatesToApply: Partial<Message> = {};
        
        // Include all fields now that we've added the missing columns
        if (updates.content !== undefined) updatesToApply.content = updates.content;
        if (updates.image !== undefined) updatesToApply.image = updates.image;
        if (updates.citations !== undefined) updatesToApply.citations = updates.citations;
        if (updates.modelId !== undefined) updatesToApply.modelId = updates.modelId;
        if (updates.promptTokens !== undefined) updatesToApply.promptTokens = updates.promptTokens;
        if (updates.completionTokens !== undefined) updatesToApply.completionTokens = updates.completionTokens;
        
        // Update in database
        const result = await db.update(messages)
          .set(updatesToApply)
          .where(eq(messages.id, id))
          .returning();
        
        if (result.length > 0) {
          console.log(`Updated message ${id} in database`);
          return result[0];
        }
      }
    } catch (error) {
      console.error(`Database error when updating message ${id}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    const message = this.messages.get(id);
    
    if (!message) {
      return undefined;
    }
    
    const updatedMessage: Message = {
      ...message,
      content: updates.content !== undefined ? updates.content : message.content,
      image: updates.image !== undefined ? updates.image : message.image,
      citations: updates.citations !== undefined ? updates.citations : message.citations,
      modelId: updates.modelId !== undefined ? updates.modelId : message.modelId,
      promptTokens: updates.promptTokens !== undefined ? updates.promptTokens : message.promptTokens,
      completionTokens: updates.completionTokens !== undefined ? updates.completionTokens : message.completionTokens,
    };
    
    this.messages.set(id, updatedMessage);
    console.log(`Updated message ${id} in memory`);
    return updatedMessage;
  }
  
  // Document methods
  async getDocument(id: number): Promise<Document | undefined> {
    try {
      const documentFromDb = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      
      if (documentFromDb.length > 0) {
        return documentFromDb[0];
      }
    } catch (error) {
      console.error('Database error when getting document:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return this.documents.get(id);
  }
  
  // Alias for getDocument to maintain backward compatibility
  async getDocumentById(id: number): Promise<Document | undefined> {
    return this.getDocument(id);
  }
  
  // Update document with new data
  async updateDocument(id: number, data: Partial<Document>): Promise<Document | undefined> {
    try {
      // Try to get document from database first
      const documentFromDb = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      
      if (documentFromDb.length > 0) {
        // Document exists in database, update it
        const result = await db.update(documents)
          .set({
            ...data,
            updatedAt: new Date()
          })
          .where(eq(documents.id, id))
          .returning();
        
        if (result.length > 0) {
          console.log(`Updated document ${id} in database`);
          return result[0];
        }
      }
    } catch (error) {
      console.error(`Database error when updating document ${id}:`, error);
    }
    
    // Fallback to in-memory storage if DB fails
    const document = this.documents.get(id);
    
    if (!document) {
      return undefined;
    }
    
    const updatedDocument: Document = {
      ...document,
      ...data,
      updatedAt: new Date()
    };
    
    this.documents.set(id, updatedDocument);
    console.log(`Updated document ${id} in memory:`, updatedDocument);
    return updatedDocument;
  }
  
  // Update document metadata
  async updateDocumentMetadata(id: number, metadata: any): Promise<Document | undefined> {
    const document = await this.getDocument(id);
    
    if (!document) {
      return undefined;
    }
    
    const updatedDocument: Document = {
      ...document,
      metadata: metadata
    };
    
    this.documents.set(id, updatedDocument);
    return updatedDocument;
  }
  
  async getDocumentsByConversation(conversationId: number): Promise<Document[]> {
    try {
      const documentsFromDb = await db.select().from(documents)
        .where(eq(documents.conversationId, conversationId))
        .orderBy(asc(documents.createdAt));
      
      if (documentsFromDb.length > 0) {
        return documentsFromDb;
      }
    } catch (error) {
      console.error('Database error when getting documents by conversation:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return Array.from(this.documents.values())
      .filter(doc => doc.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  
  async createDocument(data: Partial<InsertDocument>): Promise<Document> {
    if (!data.conversationId) {
      throw new Error("conversationId is required");
    }
    
    if (!data.fileName) {
      throw new Error("fileName is required");
    }
    
    if (!data.fileType) {
      throw new Error("fileType is required");
    }
    
    if (!data.fileSize) {
      throw new Error("fileSize is required");
    }
    
    if (!data.content) {
      throw new Error("content is required");
    }
    
    const id = this.documentId++;
    const now = new Date();
    
    const document: Document = {
      id,
      conversationId: data.conversationId,
      userId: data.userId || null,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      content: data.content,
      metadata: data.metadata || null,
      createdAt: now
    };
    
    this.documents.set(id, document);
    return document;
  }
  
  async deleteDocument(id: number): Promise<void> {
    // Delete the document
    this.documents.delete(id);
    
    // Delete all associated chunks
    const chunkIds = Array.from(this.documentChunks.entries())
      .filter(([_, chunk]) => chunk.documentId === id)
      .map(([id, _]) => id);
    
    for (const chunkId of chunkIds) {
      this.documentChunks.delete(chunkId);
    }
  }
  
  // Document chunk methods
  async getDocumentChunk(id: number): Promise<DocumentChunk | undefined> {
    try {
      const chunkFromDb = await db.select().from(documentChunks).where(eq(documentChunks.id, id)).limit(1);
      
      if (chunkFromDb.length > 0) {
        return chunkFromDb[0];
      }
    } catch (error) {
      console.error('Database error when getting document chunk:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return this.documentChunks.get(id);
  }
  
  async getChunksByDocument(documentId: number): Promise<DocumentChunk[]> {
    try {
      const chunksFromDb = await db.select().from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(asc(documentChunks.chunkIndex));
      
      if (chunksFromDb.length > 0) {
        return chunksFromDb;
      }
    } catch (error) {
      console.error('Database error when getting chunks by document:', error);
    }
    
    // Fallback to in-memory storage if DB fails
    return Array.from(this.documentChunks.values())
      .filter(chunk => chunk.documentId === documentId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }
  
  async createDocumentChunk(data: Partial<InsertDocumentChunk>): Promise<DocumentChunk> {
    if (!data.documentId) {
      throw new Error("documentId is required");
    }
    
    if (!data.content) {
      throw new Error("content is required");
    }
    
    if (data.chunkIndex === undefined) {
      throw new Error("chunkIndex is required");
    }
    
    const id = this.documentChunkId++;
    const now = new Date();
    
    const chunk: DocumentChunk = {
      id,
      documentId: data.documentId,
      content: data.content,
      chunkIndex: data.chunkIndex,
      embedding: data.embedding || null,
      createdAt: now
    };
    
    this.documentChunks.set(id, chunk);
    return chunk;
  }
  
  async updateDocumentChunkEmbedding(id: number, embedding: string): Promise<DocumentChunk | undefined> {
    const chunk = this.documentChunks.get(id);
    
    if (!chunk) {
      return undefined;
    }
    
    const updatedChunk: DocumentChunk = {
      ...chunk,
      embedding
    };
    
    this.documentChunks.set(id, updatedChunk);
    return updatedChunk;
  }
  
  /**
   * Search for document chunks with similar embeddings to the provided embedding
   * This is a naive implementation for in-memory storage
   * In a real-world scenario, this would use vector similarity search in a database
   */
  async searchSimilarChunks(embedding: string, limit: number = 5): Promise<DocumentChunk[]> {
    try {
      // For real PostgreSQL implementation, we would use pgvector here
      // For this demo, just return some chunks
      // In a production environment, we would:
      // 1. Parse the embedding string to a vector
      // 2. Use vector operations to find similar chunks
      // 3. Return the most similar chunks
      
      // Return document chunks sorted by createdAt as a fallback
      const allChunks = Array.from(this.documentChunks.values())
        .filter(chunk => chunk.embedding !== null) // Only include chunks with embeddings
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      return allChunks.slice(0, limit);
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      return [];
    }
  }
  
  // Payment transaction methods
  private paymentTransactions: Map<number, PaymentTransaction> = new Map();
  private paymentTransactionId: number = 1;
  
  async createPaymentTransaction(transaction: Partial<InsertPaymentTransaction>): Promise<PaymentTransaction> {
    const now = new Date();
    const id = this.paymentTransactionId++;
    
    try {
      // Try to create in database first
      const result = await db.insert(paymentTransactions)
        .values({
          userId: transaction.userId!,
          paypalOrderId: transaction.paypalOrderId ?? null,
          paypalCaptureId: transaction.paypalCaptureId ?? null,
          packageId: transaction.packageId ?? null,
          amount: transaction.amount!,
          fee: transaction.fee!,
          credits: transaction.credits!,
          status: transaction.status!,
          metadata: transaction.metadata ?? null,
          createdAt: now
        })
        .returning();
      
      if (result.length > 0) {
        console.log('Created payment transaction in database:', result[0]);
        return result[0];
      }
    } catch (error) {
      console.error('Database error when creating payment transaction:', error);
    }
    
    // Fallback to in-memory storage
    const newTransaction: PaymentTransaction = {
      id,
      userId: transaction.userId!,
      paypalOrderId: transaction.paypalOrderId ?? null,
      paypalCaptureId: transaction.paypalCaptureId ?? null,
      packageId: transaction.packageId ?? null,
      amount: transaction.amount!,
      fee: transaction.fee!,
      credits: transaction.credits!,
      status: transaction.status!,
      metadata: transaction.metadata ?? null,
      createdAt: now
    };
    
    this.paymentTransactions.set(id, newTransaction);
    return newTransaction;
  }
  
  async getPaymentTransactionsByUserId(userId: number): Promise<PaymentTransaction[]> {
    try {
      // Try database first
      const transactionsFromDb = await db.select().from(paymentTransactions)
        .where(eq(paymentTransactions.userId, userId))
        .orderBy(paymentTransactions.createdAt);
      
      if (transactionsFromDb.length > 0) {
        // Sort by created date in descending order
        return transactionsFromDb.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch (error) {
      console.error(`Database error when getting payment transactions for user ${userId}:`, error);
    }
    
    // Fallback to in-memory storage
    return Array.from(this.paymentTransactions.values())
      .filter(transaction => transaction.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getPaymentTransactionById(id: number): Promise<PaymentTransaction | undefined> {
    try {
      // Try database first
      const transactionFromDb = await db.select().from(paymentTransactions)
        .where(eq(paymentTransactions.id, id))
        .limit(1);
      
      if (transactionFromDb.length > 0) {
        return transactionFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting payment transaction ${id}:`, error);
    }
    
    // Fallback to in-memory storage
    return this.paymentTransactions.get(id);
  }
  
  async updatePaymentTransactionStatus(id: number, status: string): Promise<PaymentTransaction | undefined> {
    try {
      // Try to update in database first
      const result = await db.update(paymentTransactions)
        .set({ status })
        .where(eq(paymentTransactions.id, id))
        .returning();
      
      if (result.length > 0) {
        console.log(`Updated payment transaction ${id} status to "${status}" in database`);
        return result[0];
      }
    } catch (error) {
      console.error(`Database error when updating payment transaction ${id} status:`, error);
    }
    
    // Fallback to in-memory storage
    const transaction = this.paymentTransactions.get(id);
    
    if (!transaction) {
      return undefined;
    }
    
    const updated = {
      ...transaction,
      status
    };
    
    this.paymentTransactions.set(id, updated);
    console.log(`Updated payment transaction ${id} status to "${status}" in memory`);
    return updated;
  }
  
  // Usage log methods
  private usageLogs: Map<number, UsageLog> = new Map();
  private usageLogId: number = 1;
  
  async createUsageLog(log: Partial<InsertUsageLog>): Promise<UsageLog> {
    const now = new Date();
    const id = this.usageLogId++;
    
    try {
      // Try to create in database first
      const result = await db.insert(usageLogs)
        .values({
          userId: log.userId!,
          messageId: log.messageId ?? null,
          modelId: log.modelId!,
          promptTokens: log.promptTokens!,
          completionTokens: log.completionTokens!,
          imageCount: log.imageCount ?? 0,
          creditsUsed: log.creditsUsed!,
          metadata: log.metadata ?? null,
          createdAt: now
        })
        .returning();
      
      if (result.length > 0) {
        console.log('Created usage log in database:', result[0]);
        return result[0];
      }
    } catch (error) {
      console.error('Database error when creating usage log:', error);
    }
    
    // Fallback to in-memory storage
    const newLog: UsageLog = {
      id,
      userId: log.userId!,
      messageId: log.messageId ?? null,
      modelId: log.modelId!,
      promptTokens: log.promptTokens!,
      completionTokens: log.completionTokens!,
      imageCount: log.imageCount ?? 0,
      creditsUsed: log.creditsUsed!,
      metadata: log.metadata ?? null,
      createdAt: now
    };
    
    this.usageLogs.set(id, newLog);
    return newLog;
  }
  
  async getUsageLogsByUserId(userId: number): Promise<UsageLog[]> {
    try {
      // Try database first
      const logsFromDb = await db.select().from(usageLogs)
        .where(eq(usageLogs.userId, userId))
        .orderBy(usageLogs.createdAt);
      
      if (logsFromDb.length > 0) {
        // Sort by created date in descending order
        return logsFromDb.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch (error) {
      console.error(`Database error when getting usage logs for user ${userId}:`, error);
    }
    
    // Fallback to in-memory storage
    return Array.from(this.usageLogs.values())
      .filter(log => log.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getUsageLogsByTimeRange(userId: number, startDate: Date, endDate: Date): Promise<UsageLog[]> {
    try {
      // Try database first
      const logsFromDb = await db.select().from(usageLogs)
        .where(eq(usageLogs.userId, userId))
        .where(
          sql`${usageLogs.createdAt} >= ${startDate.toISOString()} AND ${usageLogs.createdAt} <= ${endDate.toISOString()}`
        );
      
      if (logsFromDb.length > 0) {
        return logsFromDb.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch (error) {
      console.error(`Database error when getting usage logs for user ${userId} in time range:`, error);
    }
    
    // Fallback to in-memory storage
    return Array.from(this.usageLogs.values())
      .filter(log => 
        log.userId === userId && 
        new Date(log.createdAt) >= startDate && 
        new Date(log.createdAt) <= endDate
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getUsageStatsByModel(userId: number, startDate: Date, endDate: Date): Promise<{modelId: string, totalCredits: number, totalTokens: number, promptTokens: number, completionTokens: number, imageCount: number, usageCount: number}[]> {
    try {
      // Try database first - this would be a more complex query in SQL
      const logsFromDb = await db.select().from(usageLogs)
        .where(eq(usageLogs.userId, userId))
        .where(
          sql`${usageLogs.createdAt} >= ${startDate.toISOString()} AND ${usageLogs.createdAt} <= ${endDate.toISOString()}`
        );
      
      if (logsFromDb.length > 0) {
        // Group and aggregate the logs by model ID with more detailed metrics
        const modelStats = new Map<string, {
          totalCredits: number, 
          totalTokens: number,
          promptTokens: number,
          completionTokens: number,
          imageCount: number,
          usageCount: number
        }>();
        
        logsFromDb.forEach((log: any) => {
          const stats = modelStats.get(log.modelId) || {
            totalCredits: 0, 
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            imageCount: 0,
            usageCount: 0
          };
          
          stats.totalCredits += log.creditsUsed;
          stats.promptTokens += log.promptTokens || 0;
          stats.completionTokens += log.completionTokens || 0;
          stats.totalTokens += (log.promptTokens + log.completionTokens);
          stats.imageCount += log.imageCount || 0;
          stats.usageCount += 1;
          
          modelStats.set(log.modelId, stats);
        });
        
        // Convert to array of objects
        return Array.from(modelStats.entries()).map(([modelId, stats]) => ({
          modelId,
          totalCredits: stats.totalCredits,
          totalTokens: stats.totalTokens,
          promptTokens: stats.promptTokens,
          completionTokens: stats.completionTokens,
          imageCount: stats.imageCount,
          usageCount: stats.usageCount
        }));
      }
    } catch (error) {
      console.error(`Database error when getting usage stats for user ${userId}:`, error);
    }
    
    // Fallback to in-memory storage
    const logs = Array.from(this.usageLogs.values())
      .filter(log => 
        log.userId === userId && 
        new Date(log.createdAt) >= startDate && 
        new Date(log.createdAt) <= endDate
      );
    
    // Group and aggregate the logs by model ID with more detailed metrics
    const modelStats = new Map<string, {
      totalCredits: number, 
      totalTokens: number,
      promptTokens: number,
      completionTokens: number,
      imageCount: number,
      usageCount: number
    }>();
    
    logs.forEach(log => {
      const stats = modelStats.get(log.modelId) || {
        totalCredits: 0, 
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        imageCount: 0,
        usageCount: 0
      };
      
      stats.totalCredits += log.creditsUsed;
      stats.promptTokens += log.promptTokens || 0;
      stats.completionTokens += log.completionTokens || 0;
      stats.totalTokens += (log.promptTokens + log.completionTokens);
      stats.imageCount += log.imageCount || 0;
      stats.usageCount += 1;
      
      modelStats.set(log.modelId, stats);
    });
    
    // Convert to array of objects
    return Array.from(modelStats.entries()).map(([modelId, stats]) => ({
      modelId,
      totalCredits: stats.totalCredits,
      totalTokens: stats.totalTokens,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      imageCount: stats.imageCount,
      usageCount: stats.usageCount
    }));
  }
  
  // User settings methods
  private userSettings: Map<number, UserSettings> = new Map();
  private userSettingsId: number = 1;
  
  async getUserSettings(userId: number): Promise<UserSettings | undefined> {
    try {
      // Try database first
      const settingsFromDb = await db.select().from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
      
      if (settingsFromDb.length > 0) {
        return settingsFromDb[0];
      }
    } catch (error) {
      console.error(`Database error when getting user settings for user ${userId}:`, error);
    }
    
    // Fallback to in-memory storage
    return Array.from(this.userSettings.values())
      .find(setting => setting.userId === userId);
  }
  
  async createOrUpdateUserSettings(settings: Partial<InsertUserSettings>): Promise<UserSettings> {
    const now = new Date();
    
    if (!settings.userId) {
      throw new Error("User ID is required for user settings");
    }
    
    try {
      // Check if settings exist for this user
      const existingSettings = await db.select().from(userSettings)
        .where(eq(userSettings.userId, settings.userId))
        .limit(1);
      
      if (existingSettings.length > 0) {
        // Update existing settings
        const result = await db.update(userSettings)
          .set({
            lowBalanceThreshold: settings.lowBalanceThreshold ?? existingSettings[0].lowBalanceThreshold,
            emailNotificationsEnabled: settings.emailNotificationsEnabled ?? existingSettings[0].emailNotificationsEnabled,
            updatedAt: now
          })
          .where(eq(userSettings.userId, settings.userId))
          .returning();
        
        if (result.length > 0) {
          console.log(`Updated user settings for user ${settings.userId} in database`);
          return result[0];
        }
      } else {
        // Create new settings
        const result = await db.insert(userSettings)
          .values({
            userId: settings.userId,
            lowBalanceThreshold: settings.lowBalanceThreshold ?? 5000,
            emailNotificationsEnabled: settings.emailNotificationsEnabled ?? true,
            createdAt: now,
            updatedAt: now
          })
          .returning();
        
        if (result.length > 0) {
          console.log(`Created user settings for user ${settings.userId} in database`);
          return result[0];
        }
      }
    } catch (error) {
      console.error(`Database error when creating/updating user settings for user ${settings.userId}:`, error);
    }
    
    // Fallback to in-memory storage
    // Check if settings exist for this user
    const existingSettings = Array.from(this.userSettings.values())
      .find(setting => setting.userId === settings.userId);
    
    if (existingSettings) {
      // Update existing settings
      const updated: UserSettings = {
        ...existingSettings,
        lowBalanceThreshold: settings.lowBalanceThreshold ?? existingSettings.lowBalanceThreshold,
        emailNotificationsEnabled: settings.emailNotificationsEnabled ?? existingSettings.emailNotificationsEnabled,
        updatedAt: now
      };
      
      this.userSettings.set(existingSettings.id, updated);
      console.log(`Updated user settings for user ${settings.userId} in memory`);
      return updated;
    } else {
      // Create new settings
      const id = this.userSettingsId++;
      
      const newSettings: UserSettings = {
        id,
        userId: settings.userId,
        lowBalanceThreshold: settings.lowBalanceThreshold ?? 5000,
        emailNotificationsEnabled: settings.emailNotificationsEnabled ?? true,
        createdAt: now,
        updatedAt: now
      };
      
      this.userSettings.set(id, newSettings);
      console.log(`Created user settings for user ${settings.userId} in memory`);
      return newSettings;
    }
  }

  // Content description methods (images, audio, video, etc.)
  
  async getContentDescription(id: number): Promise<ImageDescription | undefined> {
    // Try getting from database first
    try {
      const result = await db.select().from(imageDescriptions)
        .where(eq(imageDescriptions.id, id))
        .limit(1);
      
      if (result.length > 0) {
        return result[0];
      }
    } catch (error) {
      console.error(`Database error when getting content description ${id}:`, error);
    }
    
    // Fallback to in-memory storage
    return this.imageDescriptions.get(id);
  }
  
  async getContentByConversation(conversationId: number): Promise<ImageDescription[]> {
    // Try getting from database first
    try {
      const result = await db.select().from(imageDescriptions)
        .where(eq(imageDescriptions.conversationId, conversationId))
        .orderBy(imageDescriptions.createdAt);
      
      if (result.length > 0) {
        return result;
      }
    } catch (error) {
      console.error(`Database error when getting content for conversation ${conversationId}:`, error);
    }
    
    // Fallback to in-memory storage
    return Array.from(this.imageDescriptions.values())
      .filter(content => content.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  
  async createContentDescription(data: Partial<InsertImageDescription>): Promise<ImageDescription> {
    const now = new Date();
    
    // Validate required fields
    if (!data.conversationId) {
      throw new Error("Conversation ID is required for content descriptions");
    }
    
    if (!data.imageIdentifier) {
      throw new Error("Content identifier is required");
    }
    
    if (!data.textDescription) {
      throw new Error("Text description is required");
    }
    
    if (!data.mimeType) {
      throw new Error("MIME type is required");
    }
    
    if (data.fileSize === undefined) {
      throw new Error("File size is required");
    }
    
    // Try to create in database first
    try {
      const result = await db.insert(imageDescriptions)
        .values({
          conversationId: data.conversationId,
          userId: data.userId ?? null,
          imageIdentifier: data.imageIdentifier,
          textDescription: data.textDescription,
          mimeType: data.mimeType,
          fileSize: data.fileSize,
          type: data.type ?? "content_description",
          embedding: data.embedding ?? null,
          metadata: data.metadata ?? null,
          expiresAt: data.expiresAt ?? null,
          createdAt: now
        })
        .returning();
      
      if (result.length > 0) {
        console.log('Created content description in database:', result[0].id);
        return result[0];
      }
    } catch (error) {
      console.error('Database error when creating content description:', error);
    }
    
    // Fallback to in-memory storage
    const id = this.imageDescriptionId++;
    
    const contentDescription: ImageDescription = {
      id,
      conversationId: data.conversationId,
      userId: data.userId ?? null,
      imageIdentifier: data.imageIdentifier,
      textDescription: data.textDescription,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      type: data.type ?? "content_description",
      embedding: data.embedding ?? null,
      metadata: data.metadata ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: now
    };
    
    this.imageDescriptions.set(id, contentDescription);
    console.log('Created content description in memory:', id);
    
    return contentDescription;
  }
  
  async updateContentDescription(id: number, updates: Partial<InsertImageDescription>): Promise<ImageDescription | undefined> {
    // Try to update in database first
    try {
      // Check if content description exists
      const existing = await db.select().from(imageDescriptions).where(eq(imageDescriptions.id, id)).limit(1);
      
      if (existing.length > 0) {
        const result = await db.update(imageDescriptions)
          .set(updates)
          .where(eq(imageDescriptions.id, id))
          .returning();
        
        if (result.length > 0) {
          console.log(`Updated content description ${id} in database`);
          return result[0];
        }
      }
    } catch (error) {
      console.error(`Database error when updating content description ${id}:`, error);
    }
    
    // Fallback to in-memory storage
    const contentDescription = this.imageDescriptions.get(id);
    
    if (!contentDescription) {
      return undefined;
    }
    
    const updated = {
      ...contentDescription,
      ...updates
    };
    
    this.imageDescriptions.set(id, updated);
    console.log(`Updated content description ${id} in memory`);
    
    return updated;
  }
  
  async deleteContentDescription(id: number): Promise<void> {
    // Try to delete from database first
    try {
      await db.delete(imageDescriptions)
        .where(eq(imageDescriptions.id, id))
        .execute();
      
      console.log(`Deleted content description ${id} from database`);
    } catch (error) {
      console.error(`Database error when deleting content description ${id}:`, error);
    }
    
    // Also remove from memory storage as a fallback
    this.imageDescriptions.delete(id);
    console.log(`Deleted content description ${id} from memory`);
  }
  
  // Alias methods for backward compatibility
  async getImageDescription(id: number): Promise<ImageDescription | undefined> {
    return this.getContentDescription(id);
  }
  
  async getImagesByConversation(conversationId: number): Promise<ImageDescription[]> {
    return this.getContentByConversation(conversationId);
  }
  
  async createImageDescription(data: Partial<InsertImageDescription>): Promise<ImageDescription> {
    return this.createContentDescription(data);
  }
  
  async updateImageDescription(id: number, updates: Partial<InsertImageDescription>): Promise<ImageDescription | undefined> {
    return this.updateContentDescription(id, updates);
  }
  
  async deleteImageDescription(id: number): Promise<void> {
    return this.deleteContentDescription(id);
  }
}

export const storage = new MemStorage();
