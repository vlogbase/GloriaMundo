import { readFile } from 'fs/promises';
import { parse as parseHtml } from 'node-html-parser';
import { DocumentChunk, Document, InsertDocumentChunk } from '@shared/schema';
import { pipeline } from '@xenova/transformers';
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