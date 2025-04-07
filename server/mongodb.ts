import { MongoClient, Db } from 'mongodb';

// MongoDB connection URL from environment variable
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'gloriamundo';

/**
 * MongoDB service for vector operations
 */
class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    // Connection will be established on first use
  }

  /**
   * Initialize MongoDB connection
   */
  public async connect(): Promise<void> {
    // Skip if already connected or connection is in progress
    if (this.isConnected() || this.connectionPromise) {
      return this.connectionPromise ? this.connectionPromise : Promise.resolve();
    }

    // Skip if no MongoDB URI is defined
    if (!MONGODB_URI) {
      console.log('No MongoDB URI provided, skipping MongoDB connection');
      return Promise.resolve();
    }

    this.connectionPromise = new Promise<void>(async (resolve, reject) => {
      try {
        console.log('Connecting to MongoDB...');
        
        // Create MongoDB client
        this.client = new MongoClient(MONGODB_URI, {
          // MongoDB connection options
        });
        
        // Connect to MongoDB
        await this.client.connect();
        
        // Get database
        this.db = this.client.db(DB_NAME);
        
        console.log('Connected to MongoDB successfully');
        
        // Set up indexes if needed
        await this.setupIndexes();
        
        resolve();
      } catch (error) {
        console.error('MongoDB connection error:', error);
        this.client = null;
        this.db = null;
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Check if MongoDB is connected
   */
  public isConnected(): boolean {
    return !!this.client && !!this.db;
  }

  /**
   * Get MongoDB database instance
   */
  public getDb(): Db {
    if (!this.db) {
      throw new Error('MongoDB not connected');
    }
    return this.db;
  }

  /**
   * Set up required indexes for collections
   */
  private async setupIndexes(): Promise<void> {
    if (!this.db) return;

    try {
      // Create rag_vectors collection if it doesn't exist
      if (!(await this.collectionExists('rag_vectors'))) {
        await this.db.createCollection('rag_vectors');
        console.log('Created rag_vectors collection');
      }

      // Create index on conversationId and userId for faster filtering
      await this.db.collection('rag_vectors').createIndex(
        { conversationId: 1, userId: 1 },
        { background: true }
      );

      // Create index on type field
      await this.db.collection('rag_vectors').createIndex(
        { type: 1 },
        { background: true }
      );

      console.log('MongoDB indexes set up successfully');
    } catch (error) {
      console.error('Error setting up MongoDB indexes:', error);
    }
  }

  /**
   * Check if a collection exists
   */
  private async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.db) return false;
    
    const collections = await this.db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
  }

  /**
   * Close MongoDB connection
   */
  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.connectionPromise = null;
    }
  }
}

// Export a singleton instance
export const mongoDb = new MongoDBService();