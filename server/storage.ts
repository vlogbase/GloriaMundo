import { 
  users, type User, type InsertUser, 
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  documents, type Document, type InsertDocument,
  documentChunks, type DocumentChunk, type InsertDocumentChunk
} from "@shared/schema";
import { db } from "./db";
import { eq, asc, inArray, isNull } from "drizzle-orm";

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
  createMessage(message: Partial<InsertMessage>): Promise<Message>;
  updateMessage(id: number, updates: Partial<InsertMessage>): Promise<Message | undefined>;
  
  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentById(id: number): Promise<Document | undefined>; // Alias for getDocument
  getDocumentsByConversation(conversationId: number): Promise<Document[]>;
  createDocument(document: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  updateDocumentMetadata(id: number, metadata: any): Promise<Document | undefined>;
  
  // Document chunk methods
  getDocumentChunk(id: number): Promise<DocumentChunk | undefined>;
  getChunksByDocument(documentId: number): Promise<DocumentChunk[]>;
  createDocumentChunk(chunk: Partial<InsertDocumentChunk>): Promise<DocumentChunk>;
  updateDocumentChunkEmbedding(id: number, embedding: string): Promise<DocumentChunk | undefined>;
  searchSimilarChunks(embedding: string, limit?: number): Promise<DocumentChunk[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  private documents: Map<number, Document>;
  private documentChunks: Map<number, DocumentChunk>;
  
  private userId: number;
  private conversationId: number;
  private messageId: number;
  private documentId: number;
  private documentChunkId: number;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.documents = new Map();
    this.documentChunks = new Map();
    
    this.userId = 1;
    this.conversationId = 1;
    this.messageId = 1;
    this.documentId = 1;
    this.documentChunkId = 1;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const now = new Date();
    
    const user: User = {
      id,
      googleId: insertUser.googleId || null,
      email: insertUser.email || null,
      name: insertUser.name || null,
      avatarUrl: insertUser.avatarUrl || null,
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
  
  async createMessage(data: Partial<InsertMessage>): Promise<Message> {
    if (!data.conversationId) {
      throw new Error("conversationId is required");
    }
    
    if (!data.role) {
      throw new Error("role is required");
    }
    
    if (!data.content && !data.image) {
      throw new Error("Either content or image is required");
    }
    
    const now = new Date();
    
    // Try to create message in database first
    try {
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
}

export const storage = new MemStorage();
