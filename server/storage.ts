import { 
  users, type User, type InsertUser, 
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private conversations: Map<number, Conversation>;
  private messages: Map<number, Message>;
  
  private userId: number;
  private conversationId: number;
  private messageId: number;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    
    this.userId = 1;
    this.conversationId = 1;
    this.messageId = 1;
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
    // Sort conversations by updated date in descending order
    return Array.from(this.conversations.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  
  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }
  
  async createConversation(data: Partial<InsertConversation>): Promise<Conversation> {
    const id = this.conversationId++;
    const now = new Date();
    
    const conversation: Conversation = {
      id,
      userId: data.userId ?? null,
      title: data.title ?? "New Conversation",
      createdAt: now,
      updatedAt: now
    };
    
    this.conversations.set(id, conversation);
    return conversation;
  }
  
  async updateConversationTitle(id: number, title: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    
    if (!conversation) {
      return undefined;
    }
    
    const updated = {
      ...conversation,
      title,
      updatedAt: new Date()
    };
    
    this.conversations.set(id, updated);
    return updated;
  }
  
  async deleteConversation(id: number): Promise<void> {
    // Delete the conversation
    this.conversations.delete(id);
    
    // Delete all associated messages
    const messageIds = Array.from(this.messages.entries())
      .filter(([_, msg]) => msg.conversationId === id)
      .map(([id, _]) => id);
    
    for (const messageId of messageIds) {
      this.messages.delete(messageId);
    }
  }
  
  async clearConversations(): Promise<void> {
    this.conversations.clear();
    this.messages.clear();
  }
  
  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }
  
  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    // Return messages sorted by created date
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
    
    const id = this.messageId++;
    const now = new Date();
    
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
    return updatedMessage;
  }
}

export const storage = new MemStorage();
