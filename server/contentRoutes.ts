import { Express, Request, Response } from 'express';
import multer from 'multer';
import { isAuthenticated } from './routes';
import { storage } from './storage';
import { contentStorage } from './contentStorage';
import { mongoDb } from './mongodb';
import { generateEmbedding } from './documentProcessor';
import crypto from 'crypto';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept multiple file types for multimodal models
    if (
      file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('video/') || 
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/pdf' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/rtf'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type for multimodal processing'));
    }
  }
});

// OpenRouter API helper for multimodal models
async function generateContentDescription(
  fileUrl: string,
  userId: number,
  modelId: string = 'anthropic/claude-3-opus-20240229'
): Promise<string> {
  try {
    // Get user's multimodal model preference from preset 4
    const userPresets = await storage.getUserPresets(userId);
    const preferredModelId = userPresets.preset4ModelId || modelId;
    
    // Prepare multimodal content
    const content = [
      { type: 'text', text: 'Analyze this content and provide a detailed description in 2-3 sentences. Describe what you see, hear, or read depending on the content type.' },
      { type: 'image_url', image_url: { url: fileUrl } }
    ];
    
    // Get OpenRouter API key from environment
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not found');
    }
    
    // Call OpenRouter API with multimodal model
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gloriamundo.com/',
        'X-Title': 'GloriaMundo'
      },
      body: JSON.stringify({
        model: preferredModelId,
        messages: [
          { role: 'user', content }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const description = data.choices[0]?.message?.content || 'No description available';
    
    return description;
  } catch (error) {
    console.error('Error generating content description:', error);
    return 'Failed to generate content description';
  }
}

// Add content to MongoDB for RAG
async function addContentToMongoDb(
  fileIdentifier: string,
  textDescription: string,
  userId: number,
  conversationId: number,
  mimeType?: string
): Promise<void> {
  try {
    // Only proceed if MongoDB is configured
    if (!mongoDb.isConnected()) {
      console.log('MongoDB not connected, skipping vector storage');
      return;
    }
    
    console.log(`Generating embedding for content description (${textDescription.length} chars)`);
    
    // Generate a unique ID for the content that can be referenced in RAG queries
    const contentId = crypto.createHash('md5').update(fileIdentifier).digest('hex').substring(0, 8);
    
    // Determine content type from MIME type
    const contentType = mimeType?.startsWith('image/') ? 'image' : 
                        mimeType?.startsWith('video/') ? 'video' :
                        mimeType?.startsWith('audio/') ? 'audio' : 'document';
    
    // Create embedding from content description using our service
    const embeddingString = await generateEmbedding(textDescription);
    
    // Parse embedding string back to an array for MongoDB
    const embedding = JSON.parse(embeddingString);
    
    // Store in MongoDB vector collection
    const db = mongoDb.getDb();
    const collection = db.collection('rag_vectors');
    
    await collection.insertOne({
      userId: userId.toString(), // Store as string for consistency with document chunks
      conversationId: conversationId.toString(),
      type: contentType, // Type of content (image, video, audio, document)
      content: textDescription, // Matching the field name used in document chunks
      description: textDescription, // Alternative field for compatibility
      contentId, // Unique ID for this content
      fileUrl: fileIdentifier, // Original URL
      embedding, // Vector representation
      metadata: {
        type: `${contentType}_description`,
        mimeType: mimeType || fileIdentifier.split('.').pop()?.toLowerCase() || 'unknown'
      },
      createdAt: new Date()
    });
    
    console.log(`Content description added to MongoDB vector collection with ID ${contentId}`);
    return;
  } catch (error) {
    console.error('Error adding content to MongoDB:', error);
  }
}

export function registerContentRoutes(app: Express) {
  // Upload a file for multimodal processing
  app.post('/api/upload-content', isAuthenticated, upload.single('content'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Get the file data and userId
      const fileBuffer = req.file.buffer;
      const mimeType = req.file.mimetype;
      const userId = (req.user as any)?.id;
      const conversationId = parseInt(req.body.conversationId || '0');
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' });
      }
      
      // Upload file to storage
      const fileUrl = await contentStorage.uploadFile(fileBuffer, mimeType, userId);
      
      // Generate file description using multimodal model
      const textDescription = await generateContentDescription(fileUrl, userId);
      
      // Save file metadata in database
      const imageDescription = await storage.createImageDescription({
        conversationId,
        userId,
        imageIdentifier: fileUrl,
        textDescription,
        mimeType,
        fileSize: fileBuffer.length,
        type: 'image_description',
        metadata: { 
          width: req.body.width || null,
          height: req.body.height || null
        }
      });
      
      // Add to MongoDB vector collection for RAG if available
      await addContentToMongoDb(fileUrl, textDescription, userId, conversationId, mimeType);
      
      res.status(201).json({
        success: true,
        fileUrl,
        imageDescription
      });
    } catch (error) {
      console.error('Error uploading file for multimodal processing:', error);
      res.status(500).json({ 
        error: 'Failed to upload file for multimodal processing', 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get a specific content description by ID
  app.get('/api/content/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      const contentDescription = await storage.getImageDescription(contentId);
      
      if (!contentDescription) {
        return res.status(404).json({ error: 'Content not found' });
      }
      
      // Check if user has access to this content
      if (contentDescription.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.status(200).json(contentDescription);
    } catch (error) {
      console.error('Error getting content:', error);
      res.status(500).json({ error: 'Failed to get content' });
    }
  });
  
  // Get all content items for a conversation
  app.get('/api/conversations/:id/content', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      // Verify user has access to this conversation
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const contentItems = await storage.getImagesByConversation(conversationId);
      
      res.status(200).json(contentItems);
    } catch (error) {
      console.error('Error getting content for conversation:', error);
      res.status(500).json({ error: 'Failed to get content items' });
    }
  });
}