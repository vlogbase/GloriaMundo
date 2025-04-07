import { MongoClient, Db } from 'mongodb';

/**
 * MongoDB service for vector operations
 */
class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectionPromise: Promise<void> | null = null;
  
  constructor() {
    // Initialize connection lazily
  }
  
  /**
   * Initialize MongoDB connection
   */
  public async connect(): Promise<void> {
    // If already connecting, return existing promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    // If already connected, return immediately
    if (this.client && this.db) {
      return Promise.resolve();
    }
    
    // Create connection promise
    this.connectionPromise = new Promise<void>(async (resolve, reject) => {
      try {
        const uri = process.env.MONGODB_URI;
        
        if (!uri) {
          console.log("MongoDB URI not provided, skipping connection");
          resolve();
          return;
        }
        
        console.log("Connecting to MongoDB...");
        this.client = new MongoClient(uri);
        await this.client.connect();
        
        this.db = this.client.db("gloriamundo");
        console.log("Connected to MongoDB");
        
        // Create vector index if it doesn't exist
        // This is handled separately in create-mongodb-vector-index.js
        
        resolve();
      } catch (error) {
        console.error("MongoDB connection error:", error);
        this.client = null;
        this.db = null;
        reject(error);
      } finally {
        this.connectionPromise = null;
      }
    });
    
    return this.connectionPromise;
  }
  
  /**
   * Check if MongoDB is connected
   */
  public isConnected(): boolean {
    return !!(this.client && this.db);
  }
  
  /**
   * Get MongoDB database instance
   */
  public getDb(): Db {
    if (!this.db) {
      throw new Error("MongoDB not connected");
    }
    return this.db;
  }
  
  /**
   * Close MongoDB connection
   */
  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log("MongoDB connection closed");
    }
  }
}

export const mongoDb = new MongoDBService();

// Try to connect on module import
(async () => {
  try {
    await mongoDb.connect();
  } catch (error) {
    console.error("Failed to connect to MongoDB on startup:", error);
  }
})();