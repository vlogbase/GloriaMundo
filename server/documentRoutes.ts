import { Express, Request, Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import multer from 'multer';
import { isAuthenticated } from './routes';
import { storage } from './storage';
import { processDocument, findSimilarChunks, formatContextForPrompt } from './documentProcessor';

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: async function (req, file, cb) {
      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'temp');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (err) {
        console.error('Error creating temp directory:', err);
      }
      cb(null, tempDir);
    },
    filename: function (req, file, cb) {
      // Generate a unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
  fileFilter: function (req, file, cb) {
    // Allow only certain file types
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/html',
      'text/markdown',
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, DOCX, TXT, HTML, MD'));
    }
  }
});

export function registerDocumentRoutes(app: Express) {
  // Route to upload a document
  app.post('/api/conversations/:id/documents', upload.single('document'), async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Get user ID if authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : undefined;
      
      // Check if conversation exists
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        // Clean up the uploaded file
        await fs.unlink(file.path);
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Process the document
      const document = await processDocument(
        file.path,
        file.originalname,
        file.mimetype,
        file.size,
        conversationId,
        userId
      );
      
      // Clean up the uploaded file after processing
      await fs.unlink(file.path);
      
      // Return the document
      res.status(201).json({
        message: 'Document uploaded and processed successfully',
        document: {
          id: document.id,
          fileName: document.fileName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          createdAt: document.createdAt
        }
      });
      
    } catch (error) {
      console.error('Error processing document upload:', error);
      res.status(500).json({ 
        message: 'Failed to upload document',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Route to get all documents for a conversation
  app.get('/api/conversations/:id/documents', async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      
      // Check if conversation exists
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Get documents
      const documents = await storage.getDocumentsByConversation(conversationId);
      
      // Return documents (without full content)
      res.json(documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        createdAt: doc.createdAt
      })));
      
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ message: 'Failed to fetch documents' });
    }
  });
  
  // Route to delete a document
  app.delete('/api/documents/:id', async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      
      // Get the document
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }
      
      // Delete the document
      await storage.deleteDocument(documentId);
      
      res.json({ message: 'Document deleted successfully' });
      
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ message: 'Failed to delete document' });
    }
  });
  
  // Route to get relevant context for a query
  app.get('/api/conversations/:id/rag', async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { query } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: 'Query is required' });
      }
      
      // Check if conversation exists
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Get relevant chunks
      const { chunks, documents } = await findSimilarChunks(query, conversationId);
      
      if (chunks.length === 0) {
        return res.json({ 
          hasContext: false,
          message: 'No relevant documents found for the query'
        });
      }
      
      // Format context for prompt
      const context = formatContextForPrompt(chunks, documents);
      
      res.json({
        hasContext: true,
        context,
        sourceDocs: chunks.map(chunk => ({
          id: chunk.id,
          documentId: chunk.documentId,
          fileName: documents[chunk.documentId]?.fileName || 'Unknown document',
          chunkIndex: chunk.chunkIndex,
          snippet: chunk.content.substring(0, 100) + '...'
        }))
      });
      
    } catch (error) {
      console.error('Error fetching RAG context:', error);
      res.status(500).json({ message: 'Failed to fetch context from documents' });
    }
  });
}