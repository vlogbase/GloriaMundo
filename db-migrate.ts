import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./shared/schema";
import { sql } from "drizzle-orm";

// Set up database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable not set");
  process.exit(1);
}

const migrationClient = postgres(connectionString, { max: 1 });

// Run schema push
async function main() {
  console.log("Starting database schema push...");
  
  try {
    const db = drizzle(migrationClient, { schema });
    
    // Create session table for connect-pg-simple
    await migrationClient.unsafe(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log("Session table created");
    
    // Create users table
    await migrationClient.unsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "googleId" varchar(255),
        "email" varchar(255),
        "name" varchar(255),
        "avatarUrl" text,
        "creditBalance" integer DEFAULT 0,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
    `);
    console.log("Users table created");
    
    // Create conversations table
    await migrationClient.unsafe(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" serial PRIMARY KEY,
        "userId" integer REFERENCES "users"("id"),
        "title" varchar(255) NOT NULL,
        "createdAt" timestamp DEFAULT now(),
        "updatedAt" timestamp DEFAULT now()
      );
    `);
    console.log("Conversations table created");
    
    // Create messages table
    await migrationClient.unsafe(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" serial PRIMARY KEY,
        "conversationId" integer REFERENCES "conversations"("id") ON DELETE CASCADE,
        "role" varchar(50) NOT NULL,
        "content" text NOT NULL,
        "image" text,
        "citations" jsonb,
        "createdAt" timestamp DEFAULT now()
      );
    `);
    console.log("Messages table created");
    
    console.log("Schema push completed successfully!");
  } catch (error) {
    console.error("Schema push failed:", error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

main();