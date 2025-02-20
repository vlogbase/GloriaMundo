import { users, chats, messages } from "@shared/schema";
import type { User, Chat, Message, InsertUser, InsertChat, InsertMessage } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";

export interface IStorage {
  createUser(user: InsertUser): Promise<User>;
  getUser(id: number): Promise<User | undefined>;
  createChat(chat: InsertChat): Promise<Chat>;
  getChatsForUser(userId: number): Promise<Chat[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesForChat(chatId: number): Promise<Message[]>;
}

export class DatabaseStorage implements IStorage {
  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    return newChat;
  }

  async getChatsForUser(userId: number): Promise<Chat[]> {
    return await db.select().from(chats).where(eq(chats.user_id, userId));
  }

  async createMessage(message: InsertMessage & { embedding?: number[] }): Promise<Message> {
    const { embedding, ...messageData } = message;
    const [newMessage] = await db
      .insert(messages)
      .values({ ...messageData, embedding })
      .returning();
    return newMessage;
  }

  async getMessagesForChat(chatId: number): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.chat_id, chatId));
  }
}

export const storage = new DatabaseStorage();