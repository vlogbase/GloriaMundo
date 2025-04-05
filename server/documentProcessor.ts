import { readFile } from 'fs/promises';
import { parse as parseHtml } from 'node-html-parser';
import { DocumentChunk, Document, InsertDocumentChunk } from '@shared/schema';
import { pipeline } from '@xenova/transformers';
import { storage } from './storage';
import * as docx from 'docx';

// Since pdf-parse has compatibility issues with ES modules, we'll use a different approach for PDFs
// We can disable this functionality temporarily or implement an alternative
const pdfExtractor = {
  async extract(buffer: Buffer): Promise<string> {
    console.log("PDF extraction is temporarily disabled");
    return "PDF extraction is temporarily disabled. Please upload text or HTML files instead.";
  }
};

// Maximum chunk size in characters
const MAX_CHUNK_SIZE = 1000;
// Maximum overlap between chunks
const CHUNK_OVERLAP = 200;

/**
 * Process document and store it
 */
export async function processDocument(
  filePath: string, 
  fileName: string,
  fileType: string, 
  fileSize: number,
  conversationId: number,
  userId?: number
): Promise<Document> {
  // Read file
  const buffer = await readFile(filePath);
  
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
      // For now, return a message that DOCX is not supported
      // We can implement proper DOCX support in the future
      return "DOCX extraction is temporarily disabled. Please upload text or HTML files instead.";
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
  // Split text into chunks
  const chunks = splitTextIntoChunks(document.content);
  
  // Store chunks
  const documentChunks: DocumentChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = await storage.createDocumentChunk({
      documentId: document.id,
      content: chunks[i],
      chunkIndex: i
    });
    
    documentChunks.push(chunk);
  }
  
  // Generate embeddings for each chunk
  for (const chunk of documentChunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      await storage.updateDocumentChunkEmbedding(chunk.id, embedding);
    } catch (error) {
      console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
    }
  }
  
  return documentChunks;
}

/**
 * Split text into chunks of roughly equal size
 */
function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    // Calculate end position, ensuring we don't exceed text length
    let end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    
    // If we're not at the end of the text, try to find a natural break point
    if (end < text.length) {
      // Look for a natural break like a paragraph or sentence ending within a window
      const window = text.substring(end - 50, end + 50);
      
      // Check for paragraph break
      const paragraphBreak = window.indexOf('\n\n');
      if (paragraphBreak !== -1 && paragraphBreak < 50) {
        end = end - 50 + paragraphBreak + 2; // +2 to include the \n\n
      } else {
        // Check for sentence break (period followed by space or newline)
        const sentenceBreak = window.search(/\.\s/);
        if (sentenceBreak !== -1 && sentenceBreak < 50) {
          end = end - 50 + sentenceBreak + 2; // +2 to include the period and space
        }
      }
    }
    
    // Add the chunk
    chunks.push(text.substring(start, end));
    
    // Set the next start position with overlap
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
  }
  
  return chunks;
}

// Create a pipeline for generating embeddings
let embeddingPipeline: any = null;

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<string> {
  try {
    // Initialize the pipeline if not already done
    if (!embeddingPipeline) {
      embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    
    // Generate embeddings
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    // Convert to string for storage
    // In a real system with pgvector, we would store this as a vector
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
    
    // Get all chunks for these documents
    const allChunks: DocumentChunk[] = [];
    for (const docId of documentIds) {
      const documentChunks = await storage.getChunksByDocument(docId);
      allChunks.push(...documentChunks);
    }
    
    // Search for similar chunks
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