import { Document, DocumentChunk } from '@shared/schema';
import { storage } from './storage';
import * as fs from 'fs';
import pdfParse from 'pdf-parse';
import parse from 'node-html-parser';
import { readFile } from 'fs/promises';
import { Document as DocxDocument, Paragraph, TextRun } from 'docx';
import { AzureOpenAI } from 'openai';
import { MongoClient } from 'mongodb';
import Pipeline from '@xenova/transformers/dist/pipeline';
import type { FeatureExtractionPipeline } from '@xenova/transformers/dist/types';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Maximum chunk size in characters - configurable via environment variables
const MAX_CHUNK_SIZE = process.env.MAX_CHUNK_SIZE ? parseInt(process.env.MAX_CHUNK_SIZE, 10) : 1000;
// Maximum overlap between chunks - configurable via environment variables
const CHUNK_OVERLAP = process.env.CHUNK_OVERLAP ? parseInt(process.env.CHUNK_OVERLAP, 10) : 200;

// Azure OpenAI configuration
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = 'gloriamundo';
const MONGODB_DOCUMENTS_COLLECTION = 'documents';
const MONGODB_CHUNKS_COLLECTION = 'document_chunks';

// Redis configuration for BullMQ
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

// Initialize Redis connection to Azure Cache for Redis
const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6380', 10), // Default to 6380 for Azure Redis (SSL port)
  password: process.env.REDIS_PASSWORD || '',
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Recommended for some cloud Redis providers
  tls: {} // Required for Azure Cache for Redis which uses SSL
};

// Helper function to generate job IDs for backward compatibility
function generateJobId(): string {
  return 'job-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Initialize Redis client and BullMQ components
const redisClient = new IORedis(redisConnectionOptions);

// Set up error handling for Redis connection
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('Successfully connected to Redis');
});

// Initialize BullMQ queue for document processing
const documentProcessingQueue = new Queue('document-processing', {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true, // Remove jobs after completion
    removeOnFail: 100, // Keep the last 100 failed jobs
  }
});

// Set up queue events for logging
const documentQueueEvents = new QueueEvents('document-processing', { connection: redisConnectionOptions });
documentQueueEvents.on('completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed successfully`);
});
documentQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed with reason: ${failedReason}`);
});

console.log('BullMQ queue and events initialized');

/**
 * Process a document in the background
 * This function handles the chunking, embedding generation, and storage of a document
 */
async function processDocumentInBackground(data: {
  documentId: number;
  text: string;
  fileName: string;
  fileType: string;
  conversationId: number;
  userId?: number;
}): Promise<void> {
  const { documentId, text, fileName, fileType, conversationId, userId } = data;
  const jobId = generateJobId();
  
  console.log(`Starting background processing for document ${documentId}: ${fileName} (Job ${jobId})`);
  
  try {
    // Update document status to processing
    await storage.updateDocument(documentId, {
      metadata: {
        processingStatus: 'processing',
        startedAt: new Date().toISOString()
      }
    });
    
    console.time(`job-${jobId}-document-processing`);
    
    // Get the document from storage
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    // Create optimized chunks for this document
    console.time(`job-${jobId}-document-chunking`);
    const chunks = createOptimizedChunks(text, fileName);
    console.timeEnd(`job-${jobId}-document-chunking`);
    console.log(`Created ${chunks.length} optimized chunks for document ${documentId}`);
    
    // Store chunks in database
    const documentChunks: DocumentChunk[] = [];
    
    // Check if MongoDB is available for storing chunks
    let mongoClient: MongoClient | null = null;
    let mongoChunksCollection: any = null;
    
    if (MONGODB_URI) {
      try {
        mongoClient = await getMongoClient();
        const mongoDb = mongoClient.db(MONGODB_DB_NAME);
        mongoChunksCollection = mongoDb.collection(MONGODB_CHUNKS_COLLECTION);
      } catch (mongoError) {
        console.error(`Job ${jobId}: Error connecting to MongoDB:`, mongoError);
      }
    }
    
    // Store chunk data without embeddings first
    console.time(`job-${jobId}-chunk-storage`);
    for (let i = 0; i < chunks.length; i++) {
      // Skip empty chunks
      if (!chunks[i].trim()) {
        console.log(`Skipping empty chunk at index ${i}`);
        continue;
      }
      
      // Create chunk in primary storage
      const chunk = await storage.createDocumentChunk({
        documentId,
        content: chunks[i],
        chunkIndex: i
      });
      
      documentChunks.push(chunk);
      
      // Store in MongoDB if available for vector search
      if (mongoChunksCollection) {
        try {
          // Ensure userId is always present and in correct format for vector search filtering
          const userIdValue = userId ? userId.toString() : "0";
          
          await mongoChunksCollection.insertOne({
            id: chunk.id.toString(),
            documentId: documentId.toString(),
            userId: userIdValue, // Always store userId (critical for vector search filtering)
            content: chunks[i],
            chunkIndex: i,
            embedding: "", // Will be updated with vector later
            createdAt: new Date()
          });
        } catch (mongoInsertError) {
          console.error(`Job ${jobId}: Error storing chunk ${i} in MongoDB:`, mongoInsertError);
        }
      }
      
      // Log progress less frequently
      if (i % 10 === 0 || i === chunks.length - 1) {
        console.log(`Job ${jobId}: Created ${i + 1}/${chunks.length} chunks`);
      }
    }
    console.timeEnd(`job-${jobId}-chunk-storage`);
    
    // OPTIMIZATION: Offload to Azure OpenAI for bulk embedding generation
    // This is much faster than generating embeddings one by one
    console.time(`job-${jobId}-embedding-generation`);
    let embeddings: string[] = [];
    
    try {
      // Process in small batches to stay within Azure OpenAI limits
      const batchSize = 16; // Azure OpenAI batch limit 
      let allResults: string[] = [];
      
      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchResults = await processBatch(batch);
        allResults.push(...batchResults);
        
        console.log(`Job ${jobId}: Processed embeddings for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);
      }
      
      embeddings = allResults;
    } catch (embeddingError) {
      console.error(`Job ${jobId}: Error generating batch embeddings:`, embeddingError);
      
      // If batch processing fails, fall back to individual processing
      // But only process a limited number to keep it fast
      const maxFallbackChunks = Math.min(chunks.length, 10);
      console.log(`Job ${jobId}: Falling back to processing ${maxFallbackChunks} individual chunks`);
      
      embeddings = await Promise.all(
        chunks.slice(0, maxFallbackChunks).map(async (chunk) => {
          try {
            return await generateEmbedding(chunk);
          } catch (e) {
            console.error(`Job ${jobId}: Error generating individual embedding:`, e);
            return ""; // Empty embedding on error
          }
        })
      );
      
      // Fill the rest with empty strings
      while (embeddings.length < chunks.length) {
        embeddings.push("");
      }
    }
    console.timeEnd(`job-${jobId}-embedding-generation`);
    
    // Update chunks with embeddings
    console.time(`job-${jobId}-embedding-storage`);
    const updatePromises = [];
    
    for (let i = 0; i < documentChunks.length; i++) {
      if (i < embeddings.length && embeddings[i]) {
        const chunk = documentChunks[i];
        
        // Update in primary storage
        updatePromises.push(
          storage.updateDocumentChunkEmbedding(chunk.id, embeddings[i])
        );
        
        // Update in MongoDB if available
        if (mongoChunksCollection) {
          updatePromises.push(
            mongoChunksCollection.updateOne(
              { id: chunk.id.toString() },
              { $set: { embedding: embeddings[i] } }
            ).catch((err: Error) => console.error(`Job ${jobId}: MongoDB update error for chunk ${i}:`, err))
          );
        }
      }
    }
    
    await Promise.all(updatePromises);
    console.timeEnd(`job-${jobId}-embedding-storage`);
    
    console.timeEnd(`job-${jobId}-document-processing`);
    console.log(`Job ${jobId}: Document processing complete for ${fileName}`);
    
    // Update document processing status
    await storage.updateDocument(documentId, {
      metadata: {
        processingStatus: 'complete',
        completedAt: new Date().toISOString(),
        chunksProcessed: documentChunks.length
      }
    });
    
    return;
  } catch (error) {
    console.error(`Job ${jobId}: Background document processing error:`, error);
    
    // Update document with error status
    try {
      await storage.updateDocument(documentId, {
        metadata: {
          processingStatus: 'error',
          errorMessage: String(error).substring(0, 255), // Truncate to avoid too long strings
          errorAt: new Date().toISOString()
        }
      });
    } catch (updateError) {
      console.error(`Job ${jobId}: Error updating document status:`, updateError);
    }
    
    throw error; // Rethrow to allow the calling function to handle it
  }
}

// Map to track collections that support vector search
const vectorSearchCapableCollections = new Map<string, boolean>();

/**
 * Check if a MongoDB collection supports vector search
 * Now uses an environment variable MONGODB_HAS_VECTOR_SEARCH rather than test queries
 */
async function checkVectorSearchCapability(collection: any): Promise<boolean> {
  // Check if we already know the answer from the cache
  const collectionName = collection.collectionName;
  if (vectorSearchCapableCollections.has(collectionName)) {
    return vectorSearchCapableCollections.get(collectionName) || false;
  }
  
  // Check environment variable MONGODB_HAS_VECTOR_SEARCH
  const hasVectorSearch = process.env.MONGODB_HAS_VECTOR_SEARCH === 'true';
  
  // Cache the result and log it
  vectorSearchCapableCollections.set(collectionName, hasVectorSearch);
  
  if (hasVectorSearch) {
    console.log(`MongoDB collection ${collectionName} supports vector search (from env var)`);
  } else {
    console.log(`MongoDB collection ${collectionName} does not support vector search (from env var)`);
  }
  
  return hasVectorSearch;
}

// Initialize Azure OpenAI client
const azureOpenAI = new AzureOpenAI({
  apiKey: AZURE_OPENAI_KEY,
  endpoint: AZURE_OPENAI_ENDPOINT,
  deployment: AZURE_OPENAI_DEPLOYMENT_NAME,
  apiVersion: "2023-12-01-preview"
});

// Initialize MongoDB client
let mongoClient: MongoClient | null = null;
let isMongoConnected = false;

// Initialize BullMQ worker for processing document jobs
const documentProcessingWorker = new Worker('document-processing', async (job) => {
  if (!job) return;
  
  try {
    // Handle different job types
    if (job.name === 'process-document') {
      // Process a full document
      const { documentId, text, fileName, fileType, conversationId, userId } = job.data;
      await processDocumentInBackground({
        documentId,
        text,
        fileName,
        fileType,
        conversationId,
        userId
      });
      console.log(`Worker completed job ${job.id} for document ${documentId}`);
      return { success: true, documentId, jobType: 'document' };
    } 
    else if (job.name === 'process-embeddings') {
      // Process embeddings for chunks
      const { documentId, chunks, totalChunks } = job.data;
      
      if (!chunks || !chunks.length) {
        throw new Error('No chunks provided for embedding generation');
      }
      
      console.log(`Worker job ${job.id}: Generating embeddings for ${chunks.length} chunks (out of ${totalChunks} total) for document ${documentId}`);
      
      // Get MongoDB connection if available
      let mongoChunksCollection = null;
      if (MONGODB_URI) {
        try {
          const mongoClient = await getMongoClient();
          const mongoDb = mongoClient.db(MONGODB_DB_NAME);
          mongoChunksCollection = mongoDb.collection(MONGODB_CHUNKS_COLLECTION);
        } catch (mongoError) {
          console.error(`Job ${job.id}: Error connecting to MongoDB:`, mongoError);
        }
      }
      
      // Use larger batch size for embedding processing
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        // Process embeddings in parallel for this batch
        await Promise.all(batch.map(async (chunk: { id: number; content: string }) => {
          try {
            const embedding = await generateEmbedding(chunk.content);
            
            // Update embedding in primary storage
            await storage.updateDocumentChunkEmbedding(chunk.id, embedding);
            
            // Update embedding in MongoDB if available
            if (mongoChunksCollection) {
              try {
                await mongoChunksCollection.updateOne(
                  { id: chunk.id.toString() },
                  { $set: { embedding } }
                );
              } catch (mongoUpdateError) {
                console.error(`Job ${job.id}: Error updating MongoDB embedding for chunk ${chunk.id}:`, mongoUpdateError);
              }
            }
          } catch (error) {
            console.error(`Job ${job.id}: Error generating embedding for chunk ${chunk.id}:`, error);
          }
        }));
        
        // Log progress less frequently
        if (i % (batchSize * 2) === 0 || i + batchSize >= chunks.length) {
          console.log(`Job ${job.id}: Embeddings for ${Math.min(i + batchSize, chunks.length)}/${chunks.length} chunks`);
        }
      }
      
      console.log(`Worker job ${job.id}: Embedding generation complete for document ${documentId}`);
      return { success: true, documentId, jobType: 'embeddings' };
    }
    else {
      throw new Error(`Unknown job name: ${job.name}`);
    }
  } catch (error) {
    console.error(`Worker failed job ${job?.id}:`, error);
    throw error; // Rethrow to mark the job as failed
  }
}, { 
  connection: redisConnectionOptions,
  // Optional: Add concurrency for processing multiple documents simultaneously
  concurrency: 2
});

// Add event handlers for worker
documentProcessingWorker.on('completed', (job) => {
  if (job) {
    console.log(`Worker: Job ${job.id} completed successfully`);
  } else {
    console.log('Worker: Job completed successfully (no job ID)');
  }
});

documentProcessingWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`Worker: Job ${job.id} failed with error:`, err);
  } else {
    console.error('Worker: Job failed with error (no job ID):', err);
  }
});

documentProcessingWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('BullMQ worker initialized successfully');

async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    isMongoConnected = true;
    console.log('Connected to MongoDB');
  } else if (!isMongoConnected) {
    await mongoClient.connect();
    isMongoConnected = true;
    console.log('Reconnected to MongoDB');
  }
  return mongoClient;
}

/**
 * Process document and store it
 * OPTIMIZATION: Dramatically improved for speed by offloading embedding to Azure
 */
export async function processDocument(params: {
  buffer: Buffer;
  fileName: string;
  fileType: string;
  fileSize: number;
  conversationId: number;
  userId?: number;
}): Promise<Document> {
  const { buffer, fileName, fileType, fileSize, conversationId, userId } = params;
  
  console.time('document-processing');
  console.log(`Processing document: ${fileName} (${Math.round(fileSize/1024)} KB)`);
  
  // Extract text based on file type
  console.time('text-extraction');
  const text = await extractTextFromFile(buffer, fileType);
  console.timeEnd('text-extraction');
  
  // Store document first so the user gets immediate feedback
  const document = await storage.createDocument({
    fileName,
    fileType,
    fileSize,
    content: text,
    conversationId,
    userId,
    metadata: {
      extractedAt: new Date().toISOString(),
      fileType,
      processingStatus: 'processing'
    }
  });
  
  // Process the document in the background using BullMQ
  // Add job to the queue
  await documentProcessingQueue.add('process-document', {
    documentId: document.id,
    text,
    fileName,
    fileType,
    conversationId,
    userId
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  });
  
  console.log(`Document ${document.id} (${fileName}) added to BullMQ queue for background processing`);
  
  console.log(`Document ${document.id} (${fileName}) queued for background processing`);
  console.timeEnd('document-processing');
  
  return document;
}

/**
 * Extract text from file based on file type
 */
async function extractTextFromFile(buffer: Buffer, fileType: string): Promise<string> {
  try {
    // Handle different file types
    if (fileType.includes('pdf')) {
      // Use our simplified PDF extractor
      return await pdfExtractor.extract(buffer);
    } else if (fileType.includes('docx')) {
      // Use our simplified DOCX extractor
      return await docxExtractor.extract(buffer);
    } else if (fileType.includes('text') || fileType.includes('txt')) {
      return buffer.toString('utf-8');
    } else if (fileType.includes('html')) {
      const root = parse(buffer.toString('utf-8'));
      // Remove scripts and styles
      root.querySelectorAll('script, style').forEach(el => el.remove());
      return root.text;
    } else {
      // For unknown types, try to extract as text
      return buffer.toString('utf-8');
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    return 'Error extracting text from document.';
  }
}

/**
 * Create chunks from document text
 */
async function createChunksFromDocument(document: Document): Promise<DocumentChunk[]> {
  console.log(`Creating chunks for document: ${document.fileName} (${document.content.length} characters)`);
  
  // Split text into chunks - use smaller chunks for large documents
  const isLargeDocument = document.content.length > 100000; // 100KB threshold
  const chunkSize = isLargeDocument ? 500 : 1000; 
  const overlapSize = isLargeDocument ? 100 : 200;
  
  console.log(`Using chunk size: ${chunkSize}, overlap: ${overlapSize}`);
  
  // Remove MAX_CHUNK_SIZE and CHUNK_OVERLAP constants and use the local variables
  const chunks = splitTextIntoChunks(document.content, chunkSize, overlapSize);
  console.log(`Document split into ${chunks.length} chunks`);
  
  // Store chunks
  const documentChunks: DocumentChunk[] = [];
  
  // Check if MongoDB is available for storing chunks
  let mongoClient: MongoClient | null = null;
  let mongoDb: any = null;
  let mongoChunksCollection: any = null;
  
  if (MONGODB_URI) {
    try {
      mongoClient = await getMongoClient();
      mongoDb = mongoClient.db(MONGODB_DB_NAME);
      mongoChunksCollection = mongoDb.collection(MONGODB_CHUNKS_COLLECTION);
      console.log("MongoDB available for storing document chunks");
    } catch (mongoError) {
      console.error("Error connecting to MongoDB:", mongoError);
      console.log("Falling back to in-memory storage for document chunks");
    }
  }
  
  for (let i = 0; i < chunks.length; i++) {
    // Skip empty chunks
    if (!chunks[i].trim()) {
      console.log(`Skipping empty chunk at index ${i}`);
      continue;
    }
    
    // Create chunk in primary storage (in-memory or SQL)
    const chunk = await storage.createDocumentChunk({
      documentId: document.id,
      content: chunks[i],
      chunkIndex: i
    });
    
    documentChunks.push(chunk);
    
    // Store in MongoDB if available for vector search
    if (mongoChunksCollection) {
      try {
        await mongoChunksCollection.insertOne({
          id: chunk.id.toString(),
          documentId: document.id.toString(),
          userId: document.userId ? document.userId.toString() : null, // Add userId for vector search filtering
          content: chunks[i],
          chunkIndex: i,
          // Empty embedding for now, will be updated later
          embedding: "",
          createdAt: new Date()
        });
      } catch (mongoInsertError) {
        console.error(`Error storing chunk ${i} in MongoDB:`, mongoInsertError);
      }
    }
    
    // Log progress
    if (i % 10 === 0 || i === chunks.length - 1) {
      console.log(`Created ${i + 1}/${chunks.length} chunks`);
    }
  }
  
  // OPTIMIZATION: Move embedding generation to background process for large docs
  // This allows the upload to complete quickly while embeddings are processed asynchronously
  if (documentChunks.length > 20 || isLargeDocument) {
    console.log(`Document has ${documentChunks.length} chunks - processing embeddings in background`);
    
    // Process embeddings in the background with BullMQ
    try {
      // Only process a subset of chunks for large documents to reduce processing time
      const maxEmbeddingChunks = isLargeDocument ? 30 : Math.min(100, documentChunks.length);
      const chunksToEmbed = documentChunks.slice(0, maxEmbeddingChunks);
      
      console.log(`Adding embedding generation job for ${chunksToEmbed.length} chunks (out of ${documentChunks.length} total)`);
      
      // Prepare job data
      const jobData = {
        documentId: document.id,
        chunks: chunksToEmbed.map(chunk => ({
          id: chunk.id,
          content: chunk.content
        })),
        isLargeDocument,
        totalChunks: documentChunks.length
      };
      
      // Add job to BullMQ queue for background processing
      await documentProcessingQueue.add('process-embeddings', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        // Lower priority than document processing jobs (higher number = lower priority)
        priority: 5 
      });
      
      console.log(`Embedding generation for document ${document.id} queued in BullMQ`);
    } catch (error) {
      console.error(`Failed to schedule embedding generation for document ${document.id}:`, error);
      
      // If we can't queue it, log the error but don't fail the entire process
      console.log("Embedding generation will be limited for this document");
    }
  } else {
    // For smaller documents, process embeddings immediately
    console.log(`Document has ${documentChunks.length} chunks - processing embeddings immediately`);
    
    // Process embeddings in parallel
    await Promise.all(documentChunks.map(async (chunk) => {
      try {
        const embedding = await generateEmbedding(chunk.content);
        
        // Update embedding in primary storage
        await storage.updateDocumentChunkEmbedding(chunk.id, embedding);
        
        // Update embedding in MongoDB if available
        if (mongoChunksCollection) {
          try {
            await mongoChunksCollection.updateOne(
              { id: chunk.id.toString() },
              { $set: { embedding } }
            );
          } catch (mongoUpdateError) {
            console.error(`Error updating MongoDB embedding for chunk ${chunk.id}:`, mongoUpdateError);
          }
        }
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
      }
    }));
    
    console.log(`Embedding generation complete for document ${document.id}`);
  }
  
  return documentChunks;
}

/**
 * Split text into chunks of roughly equal size
 * @param text The text to split
 * @param chunkSize The maximum size of each chunk
 * @param overlapSize The overlap between chunks
 * @returns An array of text chunks
 */
function splitTextIntoChunks(text: string, chunkSize = MAX_CHUNK_SIZE, overlapSize = CHUNK_OVERLAP): string[] {
  // Split text into paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, finalize current chunk
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from previous chunk
      // Take the last few sentences from the previous chunk
      const sentenceBoundary = /[.!?]+\s+/g;
      const lastSentences = [];
      let overlapText = '';
      let match;
      
      // Create a copy of the regex to avoid state issues with global regex
      const sentenceRegex = new RegExp(sentenceBoundary);
      let startPos = Math.max(0, currentChunk.length - overlapSize * 2);
      let searchText = currentChunk.substring(startPos);
      
      while ((match = sentenceRegex.exec(searchText)) !== null) {
        // Add the positions to account for the substring
        lastSentences.push(match.index + startPos);
      }
      
      // Use last 1-2 sentences for overlap
      if (lastSentences.length > 0) {
        // Pick the position that gives us closest to our target overlap size
        let bestPosition = lastSentences[0];
        for (const position of lastSentences) {
          if (currentChunk.length - position <= overlapSize) {
            bestPosition = position;
            break;
          }
        }
        
        overlapText = currentChunk.substring(bestPosition);
      } else if (currentChunk.length > overlapSize) {
        // If no sentence boundaries found, just take the last part
        overlapText = currentChunk.substring(currentChunk.length - overlapSize);
      } else {
        // If chunk is smaller than overlap size, use the whole chunk
        overlapText = currentChunk;
      }
      
      currentChunk = overlapText;
    }
    
    // Add paragraph to current chunk
    if (currentChunk.length > 0) {
      currentChunk += '\n\n';
    }
    currentChunk += paragraph;
  }
  
  // Add the last chunk if not empty
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Create optimized chunks from text
 * This is a more efficient chunking strategy that produces better chunks for RAG
 */
function createOptimizedChunks(text: string, fileName: string): string[] {
  // For large documents, use a different chunking strategy
  const isLargeDocument = text.length > 100000; // 100KB threshold
  
  if (isLargeDocument) {
    console.log(`Using optimized chunking for large document: ${fileName} (${text.length} chars)`);
    
    // RADICAL OPTIMIZATION: Use a more intelligent chunking strategy for large documents
    // Rather than just sampling random parts, try to create semantically meaningful chunks
    
    // First, try to identify document structure by common section headers
    const sectionHeaderPatterns = [
      /#+\s+.+/gm,                 // Markdown headers
      /\n[A-Z][A-Za-z\s]{2,50}\n/g, // Capitalized lines that might be headers
      /\n\d+(\.\d+)*\s+[A-Z].+\n/g, // Numbered sections (1.2.3 Title)
      /\b(Chapter|Section|Part)\s+\d+\b/gi, // Chapter/Section/Part markers
      /\n[A-Z][A-Za-z\s]{3,50}:/g,  // Title followed by colon
      /\b(Abstract|Introduction|Background|Methodology|Methods|Results|Discussion|Conclusion|References|Appendix)\b/gi, // Common academic section names
      /\b(Executive Summary|Overview|Objectives|Scope|Approach|Findings|Recommendations|Next Steps)\b/gi // Common business doc sections
    ];
    
    // Find potential section boundaries
    let allMatches: {index: number, length: number}[] = [];
    
    for (const pattern of sectionHeaderPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match.index !== undefined) {
          allMatches.push({
            index: match.index,
            length: match[0].length
          });
        }
      }
    }
    
    // Sort by position in text
    allMatches.sort((a, b) => a.index - b.index);
    
    // Deduplicate overlapping matches
    const boundaries: number[] = [];
    let lastEnd = -1;
    
    for (const match of allMatches) {
      if (match.index > lastEnd) {
        boundaries.push(match.index);
        lastEnd = match.index + match.length;
      }
    }
    
    // Always include document start
    boundaries.unshift(0);
    // Always include document end
    boundaries.push(text.length);
    
    // Create intelligent chunks based on these boundaries
    const chunks: string[] = [];
    const maxChunkSize = 2500; // Larger than standard chunks for semantic completeness
    
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      const sectionText = text.substring(start, end);
      
      // If section is small enough, add as a chunk
      if (sectionText.length <= maxChunkSize) {
        if (sectionText.trim().length > 0) {
          chunks.push(sectionText);
        }
      } else {
        // Otherwise, split it into smaller chunks
        // Use environment-configurable chunk size and overlap (or fallback to defaults)
        const subChunks = splitTextIntoChunks(sectionText, MAX_CHUNK_SIZE, CHUNK_OVERLAP);
        chunks.push(...subChunks);
      }
    }
    
    // If we couldn't find good section boundaries, fall back to strategic sampling
    if (chunks.length < 3) {
      console.log("No clear section structure found, using strategic sampling");
      chunks.length = 0; // Clear the array
      
      // Always include the first part (executive summary, introduction, etc.)
      const beginningSize = 5000; // First 5000 chars
      const beginning = text.substring(0, Math.min(beginningSize, text.length));
      
      // Sample a few sections from the middle
      const middleStartPercent = 0.3; // Start at 30% into the document
      const middleEndPercent = 0.7;   // End at 70% into the document
      const middleSectionSize = 1000; // Take 1000 chars for each section
      const numMiddleSections = 5;    // Take 5 sections from the middle
      
      const middleStart = Math.floor(text.length * middleStartPercent);
      const middleEnd = Math.floor(text.length * middleEndPercent);
      const middleRange = middleEnd - middleStart;
      
      // Add the beginning
      chunks.push(beginning);
      
      // Add middle sections
      for (let i = 0; i < numMiddleSections; i++) {
        const sectionStart = middleStart + Math.floor((middleRange / numMiddleSections) * i);
        const section = text.substring(sectionStart, sectionStart + middleSectionSize);
        chunks.push(section);
      }
      
      // Add the end (conclusions, summaries, etc.)
      const endSize = 5000; // Last 5000 chars
      const end = text.substring(Math.max(0, text.length - endSize));
      chunks.push(end);
    }
    
    console.log(`Created ${chunks.length} intelligent chunks for large document`);
    return chunks;
  } else {
    // For smaller documents, use the normal chunking strategy with environment-configurable parameters
    return splitTextIntoChunks(text, MAX_CHUNK_SIZE, CHUNK_OVERLAP);
  }
}

// For PDF extraction
const pdfExtractor = {
  async extract(buffer: Buffer): Promise<string> {
    try {
      const result = await pdfParse(buffer);
      return result.text;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      return 'Error extracting text from PDF document.';
    }
  }
};

// For DOCX extraction
const docxExtractor = {
  async extract(buffer: Buffer): Promise<string> {
    try {
      // Load and parse the DOCX
      // Note: This is a simplified implementation - a more robust one would handle
      // tables, lists, and other complex structures
      const zip = require('docx/build/file/zip-stream');
      const docx = new DocxDocument();
      await docx.load(buffer);
      
      let text = '';
      
      // Extract text from paragraphs
      docx.getParagraphs().forEach((paragraph: Paragraph) => {
        paragraph.getTextRuns().forEach((textRun: TextRun) => {
          text += textRun.text + ' ';
        });
        text += '\n';
      });
      
      return text;
    } catch (error) {
      console.error('Error parsing DOCX:', error);
      return 'Error extracting text from DOCX document.';
    }
  }
};

/**
 * Process a batch of chunks to generate embeddings
 */
async function processBatch(batch: string[]): Promise<string[]> {
  console.log(`Processing batch of ${batch.length} chunks`);
  
  const results: string[] = [];
  
  // Try using Azure OpenAI for batch embedding
  if (AZURE_OPENAI_KEY && AZURE_OPENAI_ENDPOINT) {
    try {
      console.log(`Using Azure OpenAI for batch embedding generation`);
      
      // Call Azure OpenAI to generate embeddings for all texts at once
      const response = await azureOpenAI.embeddings.create({
        input: batch,
        model: AZURE_OPENAI_DEPLOYMENT_NAME, // Use deployment name as model
      });
      
      // Each embedding object contains a vector
      for (const embedding of response.data) {
        results.push(JSON.stringify(embedding.embedding));
      }
      
      console.log(`Successfully generated ${results.length} embeddings with Azure OpenAI`);
      return results;
    } catch (error) {
      console.error('Error generating batch embeddings with Azure OpenAI:', error);
      throw error; // Let the caller handle this
    }
  } else {
    console.log('Azure OpenAI not configured, falling back to individual processing');
    
    // Fall back to individual processing
    const individualResults = await Promise.all(
      batch.map(async (chunk) => {
        try {
          return await generateEmbedding(chunk);
        } catch (e) {
          console.error('Error generating individual embedding:', e);
          return ""; // Empty embedding on error
        }
      })
    );
    
    return individualResults;
  }
}

// Cache for embeddings to avoid duplicate processing
const embeddingCache = new Map<string, string>();
// For fallback to local model
let embeddingPipeline: FeatureExtractionPipeline | null = null;
// Flag to track whether we're using Azure OpenAI
let usingAzureOpenAI = AZURE_OPENAI_KEY && AZURE_OPENAI_ENDPOINT;

/**
 * Generate embedding for text
 * OPTIMIZATION: Cached to prevent redundant processing of identical text
 */
export async function generateEmbedding(text: string): Promise<string> {
  // Truncate and normalize text
  const truncatedText = text.substring(0, 8000).trim(); // Azure OpenAI has 8K token limit
  
  // Create cache key (use first 100 chars as a prefix for logging)
  const cachePrefix = truncatedText.substring(0, 100).replace(/\s+/g, ' ');
  const cacheKey = truncatedText;
  
  // Check cache first
  if (embeddingCache.has(cacheKey)) {
    console.log(`Using cached embedding for text starting with: "${cachePrefix}..."`);
    return embeddingCache.get(cacheKey) || '';
  }
  
  console.log(`Generating embedding for text: "${cachePrefix}..." (${truncatedText.length} chars)`);
  
  let result = '';
  
  // Try using Azure OpenAI first if configured
  if (usingAzureOpenAI) {
    try {
      // Call Azure OpenAI to generate embedding
      const response = await azureOpenAI.embeddings.create({
        input: truncatedText,
        model: AZURE_OPENAI_DEPLOYMENT_NAME, // Use deployment name as model
      });
      
      // Get the embedding vector
      const embedding = response.data[0].embedding;
      
      console.log(`Successfully generated embedding with Azure OpenAI (${embedding.length} dimensions)`);
      
      // Verify dimensions are as expected for text-embedding-3-large
      if (embedding.length !== 3072) {
        console.warn(`Warning: Generated embedding has ${embedding.length} dimensions, expected 3072 for text-embedding-3-large`);
      }
      
      // Convert to string for storage
      result = JSON.stringify(embedding);
      
      // Cache the result
      embeddingCache.set(cacheKey, result);
      return result;
    } catch (azureError) {
      console.error('Azure OpenAI embedding failed, falling back to local model:', azureError);
      usingAzureOpenAI = false;
      // Fall through to use local model
    }
  }
  
  // If Azure OpenAI failed or is disabled, use local model
  // Initialize the pipeline if not already done
  if (!embeddingPipeline) {
    console.log("Initializing local embedding pipeline as fallback...");
    embeddingPipeline = await pipeline('feature-extraction', 'Xenova/paraphrase-MiniLM-L3-v2');
  }
  
  // Generate embeddings using local model
  console.log(`Using local model for text of length: ${truncatedText.length} chars`);
  const startTime = Date.now();
  const output = await embeddingPipeline(truncatedText, {
    pooling: 'mean',
    normalize: true,
  });
  
  // Convert to string for storage
  result = JSON.stringify(Array.from(output.data));
  console.log(`Local embedding generated in ${Date.now() - startTime}ms`);
  
  // Cache the result
  embeddingCache.set(cacheKey, result);
  return result;
}

/**
 * Find similar chunks for a query
 */
export async function findSimilarChunks(query: string, conversationId: number, limit = 5, userId?: number, includeImages = true): Promise<{
  chunks: DocumentChunk[];
  documents: Record<number, Document>;
  imageDescriptions?: any[]; // MongoDB results for image descriptions
}> {
  try {
    console.time('similar-chunks-search');
    console.log(`Finding similar chunks for query in conversation ${conversationId}`);
    
    // Get documents for this conversation first - this is a critical optimization
    // because it lets us filter by document ID before doing any expensive embedding operations
    console.time('get-conversation-documents');
    const documents = await storage.getDocumentsByConversation(conversationId);
    console.timeEnd('get-conversation-documents');
    
    if (documents.length === 0) {
      console.log('No documents found for this conversation');
      console.timeEnd('similar-chunks-search');
      return { chunks: [], documents: {} };
    }
    
    console.log(`Found ${documents.length} documents for conversation ${conversationId}`);
    
    // Extract document IDs
    const documentIds = documents.map(doc => doc.id);
    
    // OPTIMIZATION: Generate embedding for the query only after confirming we have documents
    // This saves an expensive embedding call when there are no documents
    console.time('query-embedding-generation');
    const queryEmbedding = await generateEmbedding(query);
    console.timeEnd('query-embedding-generation');
    
    // If MongoDB is available, use it for vector similarity search
    if (MONGODB_URI) {
      try {
        const client = await getMongoClient();
        const db = client.db(MONGODB_DB_NAME);
        const chunksCollection = db.collection(MONGODB_CHUNKS_COLLECTION);
        
        console.log(`Searching for similar chunks in MongoDB using ${documentIds.length} document(s)`);
        
        // Parse the embedding from JSON string to array
        const embeddingVector = JSON.parse(queryEmbedding);
        
        // PERFORMANCE IMPROVEMENT: Use MongoDB's aggregation for vector search
        // This is significantly more efficient than loading all chunks and computing similarity in memory
        // Check if vectorSearch is available (MongoDB Atlas)
        let hasVectorSearch = await checkVectorSearchCapability(chunksCollection);
        
        // Initialize results variable
        let mongoResults: any[] = [];
        
        if (hasVectorSearch) {
          // Use MongoDB Atlas vectorSearch for optimal performance
          console.log('Using MongoDB Atlas vectorSearch for similarity search');
          try {
            // Build the vectorSearch pipeline
            const vectorSearchStage = {
              $vectorSearch: {
                index: "vector_index",
                path: "embedding",
                queryVector: embeddingVector,
                numCandidates: limit * 20, // Increased for better coverage
                limit: limit * 3, // Get more than we need for post-filtering
                filter: {
                  documentId: { $in: documentIds.map(id => id.toString()) }
                }
              }
            };
            
            // Add userId filter to the vectorSearch filter if provided
            if (userId) {
              console.log(`Adding userId filter to vectorSearch: ${userId}`);
              vectorSearchStage.$vectorSearch.filter.userId = userId.toString();
            }
            
            mongoResults = await chunksCollection.aggregate([
              // Use the vectorSearch stage with filtering directly in the vectorSearch
              vectorSearchStage,
              // Add a projection to include similarity score
              { $addFields: { similarity: { $meta: "vectorSearchScore" } } },
              // Sort by similarity (highest first)
              { $sort: { similarity: -1 } },
              // Limit results
              { $limit: limit }
            ]).toArray();
          } catch (vectorSearchError) {
            console.error("Error using vectorSearch:", vectorSearchError);
            console.log("Falling back to manual similarity calculation");
            // Set hasVectorSearch to false to use fallback
            hasVectorSearch = false;
          }
        }
        
        if (!hasVectorSearch) {
          // Fallback to manual similarity calculation with optimizations
          console.log('Using manual similarity calculation with limiting');
          
          // OPTIMIZATION: First create an index on documentId if it doesn't exist to speed up queries
          try {
            const hasDocIdIndex = await chunksCollection.indexExists("document_id_index");
            if (!hasDocIdIndex) {
              console.log("Creating index on documentId for faster retrieval");
              await chunksCollection.createIndex({ documentId: 1 }, { name: "document_id_index" });
            }
          } catch (indexError) {
            console.warn("Error checking or creating document_id_index:", indexError);
          }
          
          // Use a more efficient query approach - first get a sample of chunks to find better candidates
          const chunkCount = await chunksCollection.countDocuments({
            documentId: { $in: documentIds.map(id => id.toString()) }
          });
          
          console.log(`Total chunks available for these documents: ${chunkCount}`);
          
          // For large collections, use a more efficient sampling strategy
          let chunks: any[] = [];
          
          // Build query conditions
          const queryConditions: any = {
            embedding: { $type: "string", $ne: "" }
          };
          
          // Add userId filter if provided for security and better performance
          if (userId) {
            queryConditions.userId = userId.toString();
            console.log(`Adding userId filter to fallback query: ${userId}`);
          }
          
          if (chunkCount > 1000) {
            console.log("Large chunk collection detected, using efficient sampling strategy");
            
            // Stratified sampling - get some chunks from each document to ensure coverage
            const samplesPerDoc = Math.min(20, Math.ceil(100 / documentIds.length));
            const samplePromises = documentIds.map(async (docId) => {
              // Merge document-specific conditions with the query conditions
              const docQueryConditions = {
                ...queryConditions,
                documentId: docId.toString()
              };
              
              return chunksCollection.find(docQueryConditions).limit(samplesPerDoc).toArray();
            });
            
            const docSamples = await Promise.all(samplePromises);
            chunks = docSamples.flat();
            console.log(`Sampled ${chunks.length} chunks across ${documentIds.length} documents`);
          } else {
            // For smaller collections, we can process all chunks with embeddings
            // Merge document IDs with the query conditions
            const fullQueryConditions = {
              ...queryConditions,
              documentId: { $in: documentIds.map(id => id.toString()) }
            };
            
            chunks = await chunksCollection.find(fullQueryConditions)
              .limit(200).toArray(); // Increased limit for better results while still being efficient
          }
          
          console.log(`Found ${chunks.length} chunks in MongoDB for the specified documents`);
          
          // Only compute similarity if we have chunks
          if (chunks.length > 0) {
            console.log(`Computing similarity for ${chunks.length} chunks with embeddings`);
            
            // Compute cosine similarity for each chunk efficiently
            const chunksWithSimilarity: any[] = [];
            
            for (const chunk of chunks) {
              try {
                if (chunk && chunk.embedding && typeof chunk.embedding === 'string') {
                  const chunkEmbedding = JSON.parse(chunk.embedding);
                  const similarity = cosineSimilarity(embeddingVector, chunkEmbedding);
                  
                  // Create a new object with all properties from the original chunk plus similarity
                  chunksWithSimilarity.push({
                    ...chunk,
                    similarity
                  });
                }
              } catch (error) {
                console.error(`Error computing similarity for chunk:`, error);
                
                // Add with zero similarity if parsing fails
                chunksWithSimilarity.push({
                  ...chunk,
                  similarity: 0
                });
              }
            }
            
            // Sort by similarity (descending) and take the top results
            mongoResults = chunksWithSimilarity
              .sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0))
              .slice(0, limit);
              
            console.log(`Selected top ${mongoResults.length} chunks by similarity`);
          }
        }
        
        // If we have MongoDB results, convert them to DocumentChunk objects
        if (mongoResults && mongoResults.length > 0) {
          console.log(`Converting ${mongoResults.length} MongoDB results to DocumentChunk objects`);
          
          // Convert MongoDB documents to DocumentChunk objects
          const documentChunks: DocumentChunk[] = [];
          
          for (const chunk of mongoResults) {
            try {
              if (chunk && typeof chunk === 'object') {
                const docChunk: DocumentChunk = {
                  id: parseInt(String(chunk.id || "0")),
                  documentId: parseInt(String(chunk.documentId || "0")),
                  content: String(chunk.content || ""),
                  chunkIndex: Number(chunk.chunkIndex || 0),
                  embedding: String(chunk.embedding || ""),
                  // Add required properties from DocumentChunk type
                  createdAt: new Date()
                };
                
                documentChunks.push(docChunk);
              }
            } catch (parseError) {
              console.error("Error converting MongoDB chunk to DocumentChunk:", parseError);
            }
          }
          
          // Create a map of document IDs to documents for easy access
          const documentMap: Record<number, Document> = {};
          documents.forEach(doc => {
            documentMap[doc.id] = doc;
          });
          
          // If images should be included, query for relevant image descriptions
          let imageResults: any[] = [];
          if (includeImages) {
            try {
              // Query the rag_vectors collection for image descriptions from this conversation
              const ragVectorsCollection = db.collection('rag_vectors');
              
              // Parse the embedding from JSON string to array
              const embeddingVector = JSON.parse(queryEmbedding);
              
              // Check if vectorSearch is available on rag_vectors
              const hasRagVectorSearch = await checkVectorSearchCapability(ragVectorsCollection);
              
              if (hasRagVectorSearch) {
                console.log('Using MongoDB Atlas vectorSearch for image similarity search');
                
                try {
                  // Build vectorSearch for images
                  const imageVectorSearchStage = {
                    $vectorSearch: {
                      index: "image_vector_index",
                      path: "embedding",
                      queryVector: embeddingVector,
                      numCandidates: 20,
                      limit: 3,
                      filter: {
                        conversationId: conversationId.toString(),
                        type: "image"
                      }
                    }
                  };
                  
                  // Add userId filter for security
                  if (userId) {
                    imageVectorSearchStage.$vectorSearch.filter.userId = userId.toString();
                  }
                  
                  imageResults = await ragVectorsCollection.aggregate([
                    imageVectorSearchStage,
                    { $addFields: { similarity: { $meta: "vectorSearchScore" } } },
                    { $sort: { similarity: -1 } },
                    { $limit: 3 }
                  ]).toArray();
                  
                  console.log(`Found ${imageResults.length} relevant images using vector search`);
                } catch (vectorSearchError) {
                  console.error("Error using vectorSearch for images:", vectorSearchError);
                  console.log("Falling back to basic image query");
                  
                  // Fallback to basic query if vector search fails
                  imageResults = await ragVectorsCollection.find({
                    conversationId: conversationId.toString(),
                    type: "image",
                    ...(userId ? { userId: userId.toString() } : {})
                  }).limit(3).toArray();
                }
              } else {
                // Basic query without vector similarity
                imageResults = await ragVectorsCollection.find({
                  conversationId: conversationId.toString(),
                  type: "image",
                  ...(userId ? { userId: userId.toString() } : {})
                }).limit(3).toArray();
                
                console.log(`Found ${imageResults.length} images in conversation (without vector search)`);
              }
            } catch (imageError) {
              console.error("Error searching for relevant images:", imageError);
              // Continue without images
            }
          }
          
          return {
            chunks: documentChunks,
            documents: documentMap,
            imageDescriptions: imageResults
          };
        }
        
        console.log("No suitable chunks found in MongoDB, falling back to in-memory search");
      } catch (mongoError) {
        console.error("Error in MongoDB similarity search:", mongoError);
        console.log("Falling back to in-memory search");
      }
    }
    
    // Fall back to in-memory search if MongoDB fails or is not available
    console.log("Using in-memory similarity search");
    
    // Get all chunks for these documents
    const allChunks: DocumentChunk[] = [];
    for (const docId of documentIds) {
      const documentChunks = await storage.getChunksByDocument(docId);
      allChunks.push(...documentChunks);
    }
    
    // Search for similar chunks using the storage interface
    const similarChunks = await storage.searchSimilarChunks(queryEmbedding, limit);
    
    // Create a map of document IDs to documents for easy access
    const documentMap: Record<number, Document> = {};
    documents.forEach(doc => {
      documentMap[doc.id] = doc;
    });
    
    console.timeEnd('similar-chunks-search');
    console.log(`Found ${similarChunks.length} similar chunks for query in conversation ${conversationId}`);
    
    return {
      chunks: similarChunks,
      documents: documentMap,
      imageDescriptions: [] // No images in fallback mode
    };
  } catch (error) {
    console.error('Error finding similar chunks:', error);
    return { chunks: [], documents: {}, imageDescriptions: [] };
  }
}

// Helper function to compute cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same dimensions');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  // Handle zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Format context for AI prompt from similar chunks and image descriptions
 */
export function formatContextForPrompt(
  chunks: DocumentChunk[], 
  documents: Record<number, Document>, 
  imageDescriptions?: any[]
): string {
  let context = '';
  
  // Add document chunks if available
  if (chunks.length > 0) {
    context += '### Context from your documents:\n\n';
    
    chunks.forEach((chunk, index) => {
      const document = documents[chunk.documentId];
      const documentName = document ? document.fileName : 'Unknown document';
      
      context += `[Document: ${documentName}, Chunk ${chunk.chunkIndex + 1}]\n${chunk.content}\n\n`;
    });
    
    context += '### End of document context\n\n';
  }
  
  // Add image descriptions if available
  if (imageDescriptions && imageDescriptions.length > 0) {
    context += '### Context from conversation images:\n\n';
    
    imageDescriptions.forEach((image, index) => {
      if (image && image.description) {
        const imageId = image.imageId || `img${index + 1}`;
        const similarityNote = image.similarity 
          ? ` (Relevance: ${(image.similarity * 100).toFixed(1)}%)`
          : '';
        
        context += `[Image: ${imageId}${similarityNote}]\n${image.description}\n\n`;
      }
    });
    
    context += '### End of image context\n\n';
  }
  
  return context;
}