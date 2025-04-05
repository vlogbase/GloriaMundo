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
    fileSize: 50 * 1024 * 1024, // 50MB file size limit
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
    let filePath: string | undefined;
    
    try {
      const conversationId = parseInt(req.params.id);
      
      // Handle NaN conversationId
      if (isNaN(conversationId)) {
        return res.status(400).json({ message: 'Invalid conversation ID' });
      }
      
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      filePath = file.path;
      
      // Get user ID if authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : undefined;
      
      // Check if conversation exists
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      console.log(`Processing document: ${file.originalname} (${file.mimetype}, ${file.size} bytes) for conversation ${conversationId}`);
      
      // For large files, set a longer timeout
      const isLargeFile = file.size > 1 * 1024 * 1024; // 1MB threshold
      
      if (isLargeFile) {
        console.log(`Large file detected (${(file.size / (1024 * 1024)).toFixed(2)}MB). Setting longer timeout.`);
        
        // We'll respond immediately to prevent timeouts, then process in the background
        if (file.size > 5 * 1024 * 1024) { // 5MB threshold for very large files
          // Start processing in the background without waiting
          const buffer = await fs.readFile(file.path);
          
          // Create a placeholder document immediately with processing status
          const placeholderDocument = await storage.createDocument({
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            content: `This large document (${(file.size / (1024 * 1024)).toFixed(2)}MB) is being processed in the background.`,
            conversationId,
            userId,
            metadata: {
              extractedAt: new Date().toISOString(),
              fileType: file.mimetype,
              processingStatus: 'queued',
              processingProgress: 0
            }
          });
          
          // Update the placeholder with progress information at different stages
          const updateProcessingStatus = async (status: string, progress: number) => {
            try {
              await storage.updateDocumentMetadata(placeholderDocument.id, {
                ...placeholderDocument.metadata,
                processingStatus: status,
                processingProgress: progress,
                lastUpdated: new Date().toISOString()
              });
            } catch (err) {
              console.error(`Error updating document status to ${status}:`, err);
            }
          };
          
          // Start background processing with progress updates
          const documentPromise = (async () => {
            try {
              // Update status to "extracting"
              await updateProcessingStatus('extracting', 10);
              
              const doc = await processDocument({
                buffer,
                fileName: file.originalname,
                fileType: file.mimetype,
                fileSize: file.size,
                conversationId,
                userId,
                progressCallback: async (stage: string, progress: number) => {
                  await updateProcessingStatus(stage, progress);
                }
              });
              
              // Final update to complete
              await updateProcessingStatus('complete', 100);
              
              console.log(`Large document processed successfully in background. Document ID: ${doc.id}`);
              return doc;
            } catch (error) {
              console.error('Error processing large document in background:', error);
              await updateProcessingStatus('error', 0);
              throw error;
            }
          })();
          
          // Return the placeholder document immediately
          
          console.log(`Created placeholder for large document. Document ID: ${placeholderDocument.id}`);
          
          // Use the placeholder to respond
          return res.status(202).json({
            message: 'Large document accepted for processing',
            document: {
              id: placeholderDocument.id,
              fileName: placeholderDocument.fileName,
              fileType: placeholderDocument.fileType,
              fileSize: placeholderDocument.fileSize,
              createdAt: placeholderDocument.createdAt,
              processingStatus: 'in_progress'
            }
          });
        }
      }
      
      // For regular files, process normally
      const buffer = await fs.readFile(file.path);
      
      const document = await processDocument({
        buffer,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        conversationId,
        userId
      });
      
      console.log(`Document processed successfully. Document ID: ${document.id}`);
      
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
    } finally {
      // Clean up the uploaded file in the finally block to ensure it happens
      if (filePath) {
        try {
          await fs.unlink(filePath);
          console.log(`Temporary file deleted: ${filePath}`);
        } catch (unlinkError) {
          console.error('Error deleting temporary file:', unlinkError);
        }
      }
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
      
      // Get relevant chunks with userId for proper security filtering
      const userId = req.user?.id;
      const { chunks, documents } = await findSimilarChunks(query, conversationId, 5, userId);
      
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