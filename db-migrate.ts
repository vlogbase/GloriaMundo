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
      DROP TABLE IF EXISTS "users" CASCADE;
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "google_id" varchar(255) UNIQUE,
        "email" varchar(255) UNIQUE,
        "name" varchar(255),
        "avatar_url" text,
        "credit_balance" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("Users table created");
    
    // Create conversations table
    await migrationClient.unsafe(`
      DROP TABLE IF EXISTS "conversations" CASCADE;
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" serial PRIMARY KEY,
        "user_id" integer REFERENCES "users"("id"),
        "title" varchar(255) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("Conversations table created");
    
    // Create messages table
    await migrationClient.unsafe(`
      DROP TABLE IF EXISTS "messages" CASCADE;
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" serial PRIMARY KEY,
        "conversation_id" integer REFERENCES "conversations"("id") ON DELETE CASCADE NOT NULL,
        "role" varchar(50) NOT NULL,
        "content" text NOT NULL,
        "image" text,
        "citations" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("Messages table created");
    
    // Create transactions table
    await migrationClient.unsafe(`
      DROP TABLE IF EXISTS "transactions" CASCADE;
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" serial PRIMARY KEY,
        "user_id" integer REFERENCES "users"("id") NOT NULL,
        "type" varchar(50) NOT NULL,
        "amount" integer NOT NULL,
        "paypal_order_id" varchar(255),
        "model_id" varchar(255),
        "prompt_tokens" integer,
        "completion_tokens" integer,
        "base_amount" decimal(10, 6),
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log("Transactions table created");
    
    console.log("Schema push completed successfully!");
  } catch (error) {
    console.error("Schema push failed:", error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

main();