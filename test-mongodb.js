// Test script for MongoDB connection
import { MongoClient } from 'mongodb';

// Get MongoDB URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'gloriamundo';

async function main() {
  console.log("=== MongoDB Connection Test ===");
  console.log("MongoDB URI available:", !!MONGODB_URI);
  
  if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI environment variable is not set");
    process.exit(1);
  }
  
  try {
    // Create a new MongoClient
    const client = new MongoClient(MONGODB_URI);
    
    // Connect to the MongoDB server
    await client.connect();
    console.log("Successfully connected to MongoDB");
    
    // List available databases
    const adminDb = client.db('admin');
    const databases = await adminDb.command({ listDatabases: 1 });
    
    console.log("\nAvailable databases:");
    databases.databases.forEach(db => {
      console.log(`- ${db.name}`);
    });
    
    // Get or create our application database
    const db = client.db(DB_NAME);
    console.log(`\nUsing database: ${DB_NAME}`);
    
    // List collections in our database
    const collections = await db.listCollections().toArray();
    console.log("Collections in database:");
    
    if (collections.length === 0) {
      console.log("No collections found. Will create test collections.");
      
      // Create test collections
      await db.createCollection('documents');
      await db.createCollection('document_chunks');
      
      console.log("Created test collections 'documents' and 'document_chunks'");
    } else {
      collections.forEach(collection => {
        console.log(`- ${collection.name}`);
      });
    }
    
    // Close the client
    await client.close();
    console.log("\nMongoDB client closed");
  } catch (error) {
    console.error("MongoDB Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);