import { readFile } from 'fs/promises';
import { parse as parseHtml } from 'node-html-parser';
import { DocumentChunk, Document, InsertDocumentChunk } from '@shared/schema';
import { pipeline } from '@xenova/transformers';
import { MongoClient, ObjectId } from 'mongodb';
import { AzureOpenAI } from 'openai';
import '@azure/openai/types';
import { storage } from './storage';

// Simple extractors for different file types
// These are simplified versions to handle the files without external dependencies
// that may cause compatibility issues with ES modules

const pdfExtractor = {
  async extract(buffer: Buffer): Promise<string> {
    try {
      // First attempt to use a more robust approach
      // Since we can't rely on external PDF libraries that may be incompatible,
      // we'll improve our basic extraction
      
      // Convert buffer to string and look for text markers
      const text = buffer.toString('utf-8');
      
      // Extract text between common PDF text markers
      // This is a simplified approach but better than just raw buffer conversion
      let extractedText = '';
      
      // Look for text objects in the PDF
      const textObjects = text.match(/BT[\s\S]+?ET/g);
      if (textObjects && textObjects.length > 0) {
        // Extract text from text objects
        extractedText = textObjects.join(' ');
        
        // Clean up the text
        extractedText = extractedText
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
          .replace(/BT|ET|Tj|TJ|\[|\]|\(|\)|<|>|\/F\d+\s\d+(\.\d+)?\sTf/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // If we couldn't extract anything meaningful, fall back to basic extraction
      if (!extractedText || extractedText.length < 100) {
        console.log("PDF basic extraction fallback");
        // Extract any readable text content
        extractedText = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      return extractedText || "This PDF couldn't be fully processed. Consider converting to text format for better results.";
    } catch (error) {
      console.error("Error in PDF extraction:", error);
      return "Error extracting text from PDF. Please try a different format.";
    }
  }
};

const docxExtractor = {
  async extract(buffer: Buffer): Promise<string> {
    try {
      console.log("DOCX extraction - improved version");
      
      // DOCX files are ZIP archives with XML content
      // Extract document.xml content which contains the main text
      
      // First, try to locate the document content
      const text = buffer.toString('utf-8');
      
      // Look for word/document.xml content
      let documentXml = '';
      
      // Try to find document.xml content between markers
      const docXmlMatch = text.match(/<w:document[\s\S]+?<\/w:document>/);
      if (docXmlMatch) {
        documentXml = docXmlMatch[0];
      }
      
      let extractedText = '';
      
      if (documentXml) {
        // Extract text from w:t tags (which contain the actual text in DOCX)
        const textMatches = documentXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
        
        if (textMatches && textMatches.length > 0) {
          // Extract content between tags and join with spaces
          extractedText = textMatches
            .map(match => {
              // Extract content between <w:t> and </w:t>
              const content = match.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/, '$1');
              return content
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
            })
            .join(' ');
        }
      }
      
      // If we couldn't extract good content, fall back to basic extraction
      if (!extractedText || extractedText.length < 100) {
        console.log("DOCX basic extraction fallback");
        // Extract any readable text content from the raw buffer
        extractedText = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      return extractedText || "This DOCX couldn't be fully processed. Consider converting to text format for better results.";
    } catch (error) {
      console.error("Error in DOCX extraction:", error);
      return "Error extracting text from DOCX. Please try a different format.";
    }
  }
};

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
  
  // Extract text based on file type
  const text = await extractTextFromFile(buffer, fileType);
  
  // Store document
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
    }
  });

  // Create chunks from the text
  await createChunksFromDocument(document);
  
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
      const root = parseHtml(buffer.toString('utf-8'));
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
  
  // Generate embeddings for each chunk - but limit processing for large documents
  const maxEmbeddingChunks = isLargeDocument ? 30 : documentChunks.length;
  const chunksToEmbed = documentChunks.slice(0, maxEmbeddingChunks);
  
  console.log(`Generating embeddings for ${chunksToEmbed.length} chunks (out of ${documentChunks.length} total)`);
  
  // Use Promise.all with batching to speed up processing
  const batchSize = 5;
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
            console.error(`Error updating embedding for chunk ${chunk.id} in MongoDB:`, mongoUpdateError);
          }
        }
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
      }
    }));
    
    // Log progress
    console.log(`Processed embeddings for ${Math.min(i + batchSize, chunksToEmbed.length)}/${chunksToEmbed.length} chunks`);
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
  const chunks: string[] = [];
  let start = 0;
  
  // Skip empty text
  if (!text || text.length === 0) {
    return chunks;
  }
  
  // For very large texts, use aggressive chunking without trying to find natural breaks
  const isVeryLargeText = text.length > 500000; // 500KB
  const lookForBreaks = !isVeryLargeText;
  
  while (start < text.length) {
    // Calculate end position, ensuring we don't exceed text length
    let end = Math.min(start + chunkSize, text.length);
    
    // If we're not at the end of the text and we should look for breaks, try to find a natural break point
    if (end < text.length && lookForBreaks) {
      const windowSize = Math.min(50, Math.floor(chunkSize * 0.1)); // 10% of chunk size or 50, whichever is smaller
      
      // Don't look beyond the text length
      const upperLimit = Math.min(end + windowSize, text.length);
      
      // Look for a natural break like a paragraph or sentence ending within a window
      const window = text.substring(end - windowSize, upperLimit);
      
      // Check for paragraph break
      const paragraphBreak = window.indexOf('\n\n');
      if (paragraphBreak !== -1 && paragraphBreak < windowSize) {
        end = end - windowSize + paragraphBreak + 2; // +2 to include the \n\n
      } else {
        // Check for sentence break (period followed by space or newline)
        const sentenceBreak = window.search(/\.\s/);
        if (sentenceBreak !== -1 && sentenceBreak < windowSize) {
          end = end - windowSize + sentenceBreak + 2; // +2 to include the period and space
        } else {
          // If no natural breaks found, look for any whitespace
          const spaceBreak = window.search(/\s/);
          if (spaceBreak !== -1 && spaceBreak < windowSize) {
            end = end - windowSize + spaceBreak + 1;
          }
        }
      }
    }
    
    // Add the chunk, but first check if it's meaningful
    const chunk = text.substring(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Set the next start position with overlap
    start = end - overlapSize;
    if (start < 0) start = 0;
    
    // Avoid infinite loops
    if (start >= end) {
      start = end;
    }
  }
  
  return chunks;
}

// Flag to track if we're using Azure OpenAI for embeddings
// We'll fall back to local model if Azure OpenAI is not available or fails
let usingAzureOpenAI = true;
let embeddingPipeline: any = null;

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<string> {
  try {
    // Limit text size to prevent excessive memory usage
    const maxEmbeddingLength = 8191; // Azure OpenAI embedding model limit
    const truncatedText = text.length > maxEmbeddingLength ? 
      text.substring(0, maxEmbeddingLength) : 
      text;
    
    if (usingAzureOpenAI) {
      try {
        console.log(`Generating embedding with Azure OpenAI for text of length: ${truncatedText.length} chars`);
        const startTime = Date.now();
        
        // Use Azure OpenAI to generate embeddings
        const response = await azureOpenAI.embeddings.create({
          input: truncatedText,
          model: AZURE_OPENAI_DEPLOYMENT_NAME
        });
        
        const embedding = response.data[0].embedding;
        const duration = Date.now() - startTime;
        console.log(`Azure OpenAI Embedding generated in ${duration}ms`);
        
        // Convert to string for storage
        return JSON.stringify(embedding);
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
    console.log(`Generating embedding with local model for text of length: ${truncatedText.length} chars`);
    const startTime = Date.now();
    const output = await embeddingPipeline(truncatedText, {
      pooling: 'mean',
      normalize: true,
    });
    const duration = Date.now() - startTime;
    console.log(`Local embedding generated in ${duration}ms`);
    
    // Convert to string for storage
    return JSON.stringify(Array.from(output.data));
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Find similar chunks for a query
 */
export async function findSimilarChunks(query: string, conversationId: number, limit = 5): Promise<{
  chunks: DocumentChunk[];
  documents: Record<number, Document>;
}> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Get documents for this conversation
    const documents = await storage.getDocumentsByConversation(conversationId);
    if (documents.length === 0) {
      return { chunks: [], documents: {} };
    }
    
    // Extract document IDs
    const documentIds = documents.map(doc => doc.id);
    
    // If MongoDB is available, use it for vector similarity search
    if (MONGODB_URI) {
      try {
        const client = await getMongoClient();
        const db = client.db(MONGODB_DB_NAME);
        const chunksCollection = db.collection(MONGODB_CHUNKS_COLLECTION);
        
        console.log(`Searching for similar chunks in MongoDB using ${documentIds.length} document(s)`);
        
        // Parse the embedding from JSON string to array
        const embeddingVector = JSON.parse(queryEmbedding);
        
        // Prepare the MongoDB aggregation pipeline for vector search
        // This is a simplistic approach - in a production environment, you would use $vectorSearch
        // Here we'll use a combination of filtering and manual similarity computation
        const chunks = await chunksCollection.find({
          documentId: { $in: documentIds.map(id => id.toString()) }
        }).toArray();
        
        console.log(`Found ${chunks.length} chunks in MongoDB for the specified documents`);
        
        // If we have chunks with embeddings, compute similarity
        if (chunks.length > 0) {
          // Filter chunks that have embeddings
          const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding);
          
          if (chunksWithEmbeddings.length > 0) {
            console.log(`Computing similarity for ${chunksWithEmbeddings.length} chunks with embeddings`);
            
            // Compute cosine similarity for each chunk
            // Use any type to avoid TypeScript errors with MongoDB documents
            const chunksWithSimilarity: any[] = [];
            
            for (const chunk of chunksWithEmbeddings) {
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
            const topChunks = chunksWithSimilarity
              .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
              .slice(0, limit);
              
            console.log(`Selected top ${topChunks.length} chunks by similarity`);
            
            // Convert MongoDB documents to DocumentChunk objects
            const documentChunks: DocumentChunk[] = [];
            
            for (const chunk of topChunks) {
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