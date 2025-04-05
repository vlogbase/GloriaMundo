// Create a vector index for MongoDB to enable efficient vector search
// This script should be run once to set up the MongoDB Atlas collection for vector search

import { MongoClient } from 'mongodb';

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = 'gloriamundo';
const MONGODB_CHUNKS_COLLECTION = 'document_chunks';

async function createVectorIndex() {
  if (!MONGODB_URI) {
    console.error('MongoDB URI not configured. Please set the MONGODB_URI environment variable.');
    return;
  }

  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(MONGODB_DB_NAME);
    const chunksCollection = db.collection(MONGODB_CHUNKS_COLLECTION);
    
    // Check if collection exists
    const collections = await db.listCollections({ name: MONGODB_CHUNKS_COLLECTION }).toArray();
    if (collections.length === 0) {
      console.log(`Collection ${MONGODB_CHUNKS_COLLECTION} does not exist. Creating it...`);
      await db.createCollection(MONGODB_CHUNKS_COLLECTION);
    }
    
    // Get existing indexes
    const indexes = await chunksCollection.indexes();
    const vectorIndexExists = indexes.some(index => index.name === 'vector_index');
    
    if (vectorIndexExists) {
      console.log('Vector index already exists');
    } else {
      console.log('Creating vector index for document chunks collection...');
      
      try {
        // Attempt to create a vector index
        // This will only work on MongoDB Atlas with vector search capability
        await chunksCollection.createIndex(
          { embedding: "vector" },
          { 
            name: "vector_index",
            vectorDimension: 1536, // OpenAI embedding dimension
            vectorDistanceMetric: "cosine"
          }
        );
        console.log('Vector index created successfully');
      } catch (indexError) {
        console.error('Failed to create vector index. This usually means your MongoDB instance does not support vector search.');
        console.error('If using MongoDB Atlas, ensure you have a cluster that supports vector search.');
        console.error('Error details:', indexError);
        
        // Create a regular index for documentId for better query performance as fallback
        console.log('Creating regular index on documentId field as fallback...');
        await chunksCollection.createIndex({ documentId: 1 }, { name: "document_id_index" });
        console.log('Regular index created successfully');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

createVectorIndex().catch(console.error);