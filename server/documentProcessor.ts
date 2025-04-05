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

// Maximum chunk size in characters
const MAX_CHUNK_SIZE = 1000;
// Maximum overlap between chunks
const CHUNK_OVERLAP = 200;

// Azure OpenAI configuration
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY || '';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = 'gloriamundo';
const MONGODB_DOCUMENTS_COLLECTION = 'documents';
const MONGODB_CHUNKS_COLLECTION = 'document_chunks';

// Map to track collections that support vector search
const vectorSearchCapableCollections = new Map<string, boolean>();

/**
 * Check if a MongoDB collection supports vector search
 * This helps optimize query strategy based on available features
 */
async function checkVectorSearchCapability(collection: any): Promise<boolean> {
  // Check if we already know the answer
  const collectionName = collection.collectionName;
  if (vectorSearchCapableCollections.has(collectionName)) {
    return vectorSearchCapableCollections.get(collectionName) || false;
  }
  
  try {
    // Try a small vector search query as a test
    // This will fail with a specific error if vector search is not available
    await collection.aggregate([
      { $limit: 1 },
      { 
        $vectorSearch: {
          index: "vector_index", 
          path: "embedding",
          queryVector: Array(1536).fill(0), // Sample vector
          numCandidates: 1,
          limit: 1
        }
      }
    ]).toArray();
    
    // If we get here, vector search is available
    console.log(`MongoDB collection ${collectionName} supports vector search`);
    vectorSearchCapableCollections.set(collectionName, true);
    return true;
  } catch (error: any) {
    // Check the error to determine if vector search is unavailable vs other errors
    const errorMessage = error.message || '';
    const isVectorSearchUnavailable = 
      errorMessage.includes("vectorSearch") && 
      (errorMessage.includes("unrecognized") || errorMessage.includes("not found"));
    
    if (isVectorSearchUnavailable) {
      console.log(`MongoDB collection ${collectionName} does not support vector search`);
      vectorSearchCapableCollections.set(collectionName, false);
      return false;
    } else {
      // For other errors, assume it might be available but there was another issue
      console.warn(`Uncertain if MongoDB collection ${collectionName} supports vector search:`, errorMessage);
      return false;
    }
  }
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
      processingStatus: 'extracting'
    }
  });
  
  // Process everything else in the background to allow immediate response
  setTimeout(() => {
    (async () => {
      try {
        // RADICAL OPTIMIZATION: For very large documents, we'll use a "representative sampling" approach
        // Instead of processing the entire document, we'll select key portions that represent
        // the document's content effectively while keeping processing time minimal
        
        console.time('document-chunking');
        const chunks = createOptimizedChunks(text, fileName);
        console.timeEnd('document-chunking');
        console.log(`Created ${chunks.length} optimized chunks`);
        
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
            console.error("Error connecting to MongoDB:", mongoError);
          }
        }
        
        // Store chunk data without embeddings first
        console.time('chunk-storage');
        for (let i = 0; i < chunks.length; i++) {
          // Create chunk in primary storage
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
                content: chunks[i],
                chunkIndex: i,
                embedding: "", // Empty for now
                createdAt: new Date()
              });
            } catch (mongoInsertError) {
              console.error(`Error storing chunk ${i} in MongoDB:`, mongoInsertError);
            }
          }
        }
        console.timeEnd('chunk-storage');
        
        // RADICAL OPTIMIZATION: Offload to Azure OpenAI for bulk embedding generation
        // This is much faster than generating embeddings one by one
        console.time('embedding-generation');
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
          }
          
          embeddings = allResults;
        } catch (embeddingError) {
          console.error('Error generating batch embeddings:', embeddingError);
          
          // If batch processing fails, fall back to individual processing
          // But only process a limited number to keep it fast
          const maxFallbackChunks = Math.min(chunks.length, 10);
          console.log(`Falling back to processing ${maxFallbackChunks} individual chunks`);
          
          embeddings = await Promise.all(
            chunks.slice(0, maxFallbackChunks).map(async (chunk) => {
              try {
                return await generateEmbedding(chunk);
              } catch (e) {
                console.error('Error generating individual embedding:', e);
                return ""; // Empty embedding on error
              }
            })
          );
          
          // Fill the rest with empty strings
          while (embeddings.length < chunks.length) {
            embeddings.push("");
          }
        }
        console.timeEnd('embedding-generation');
        
        // Update chunks with embeddings
        console.time('embedding-storage');
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
                ).catch((err: Error) => console.error(`MongoDB update error for chunk ${i}:`, err))
              );
            }
          }
        }
        
        await Promise.all(updatePromises);
        console.timeEnd('embedding-storage');
        
        console.timeEnd('document-processing');
        console.log(`Document processing complete for ${fileName}`);
      } catch (error) {
        console.error('Background document processing error:', error);
      }
    })();
  }, 10); // Start right away but allow response to return first
  
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
    
    // Start background processing with a small delay to allow request to return
    setTimeout(() => {
      (async () => {
        try {
          // Only process a subset of chunks for large documents to reduce processing time
          const maxEmbeddingChunks = isLargeDocument ? 30 : Math.min(100, documentChunks.length);
          const chunksToEmbed = documentChunks.slice(0, maxEmbeddingChunks);
          
          console.log(`Background process: generating embeddings for ${chunksToEmbed.length} chunks (out of ${documentChunks.length} total)`);
          
          // Use larger batch size for background processing
          const batchSize = 10;
          for (let i = 0; i < chunksToEmbed.length; i += batchSize) {
            const batch = chunksToEmbed.slice(i, i + batchSize);
            
            // Process embeddings in parallel for this batch
            await Promise.all(batch.map(async (chunk) => {
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
            
            // Log progress less frequently
            if (i % (batchSize * 2) === 0 || i + batchSize >= chunksToEmbed.length) {
              console.log(`Background process: embeddings for ${Math.min(i + batchSize, chunksToEmbed.length)}/${chunksToEmbed.length} chunks`);
            }
          }
          
          console.log(`Background embedding generation complete for document ${document.id}`);
        } catch (bgError) {
          console.error(`Background embedding generation failed:`, bgError);
        }
      })();
    }, 100);
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
        const subChunks = splitTextIntoChunks(sectionText, 1000, 150);
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
    // For smaller documents, use the normal chunking strategy
    return splitTextIntoChunks(text);
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
export async function findSimilarChunks(query: string, conversationId: number, limit = 5): Promise<{
  chunks: DocumentChunk[];
  documents: Record<number, Document>;
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
            mongoResults = await chunksCollection.aggregate([
              // Match only chunks from our documents
              { $match: { documentId: { $in: documentIds.map(id => id.toString()) } } },
              // Only consider chunks with non-empty embeddings
              { $match: { embedding: { $type: "string", $ne: "" } } },
              // Perform vector search
              {
                $vectorSearch: {
                  index: "vector_index",
                  path: "embedding",
                  queryVector: embeddingVector,
                  numCandidates: limit * 10, // Search more candidates for better results
                  limit: limit * 2 // Get more than we need to filter later
                }
              },
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
          if (chunkCount > 1000) {
            console.log("Large chunk collection detected, using efficient sampling strategy");
            
            // Stratified sampling - get some chunks from each document to ensure coverage
            const samplesPerDoc = Math.min(20, Math.ceil(100 / documentIds.length));
            const samplePromises = documentIds.map(async (docId) => {
              return chunksCollection.find({
                documentId: docId.toString(),
                embedding: { $type: "string", $ne: "" }
              }).limit(samplesPerDoc).toArray();
            });
            
            const docSamples = await Promise.all(samplePromises);
            chunks = docSamples.flat();
            console.log(`Sampled ${chunks.length} chunks across ${documentIds.length} documents`);
          } else {
            // For smaller collections, we can process all chunks with embeddings
            chunks = await chunksCollection.find({
              documentId: { $in: documentIds.map(id => id.toString()) },
              embedding: { $type: "string", $ne: "" }
            }).limit(200).toArray(); // Increased limit for better results while still being efficient
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
          
          return {
            chunks: documentChunks,
            documents: documentMap
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
      documents: documentMap
    };
  } catch (error) {
    console.error('Error finding similar chunks:', error);
    return { chunks: [], documents: {} };
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
 * Format context for AI prompt from similar chunks
 */
export function formatContextForPrompt(chunks: DocumentChunk[], documents: Record<number, Document>): string {
  if (chunks.length === 0) {
    return '';
  }
  
  let context = '### Context from your documents:\n\n';
  
  chunks.forEach((chunk, index) => {
    const document = documents[chunk.documentId];
    const documentName = document ? document.fileName : 'Unknown document';
    
    context += `[Document: ${documentName}, Chunk ${chunk.chunkIndex + 1}]\n${chunk.content}\n\n`;
  });
  
  context += '### End of context\n\n';
  return context;
}