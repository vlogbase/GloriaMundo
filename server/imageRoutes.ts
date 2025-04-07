import { Express, Request, Response } from 'express';
import multer from 'multer';
import { isAuthenticated } from './routes';
import { storage } from './storage';
import { imageStorage } from './imageStorage';
import { mongoDb } from './mongodb';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// OpenRouter API helper for multimodal models
async function generateImageDescription(
  imageUrl: string,
  userId: number,
  modelId: string = 'anthropic/claude-3-opus-20240229'
): Promise<string> {
  try {
    // Get user's multimodal model preference from preset 4
    const userPresets = await storage.getUserPresets(userId);
    const preferredModelId = userPresets.preset4ModelId || modelId;
    
    // Prepare multimodal content
    const content = [
      { type: 'text', text: 'What is shown in this image? Provide a detailed description in 2-3 sentences.' },
      { type: 'image_url', image_url: { url: imageUrl } }
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
    console.error('Error generating image description:', error);
    return 'Failed to generate image description';
  }
}

// Add image to MongoDB for RAG
async function addImageToMongoDb(
  imageIdentifier: string,
  textDescription: string,
  userId: number,
  conversationId: number
): Promise<void> {
  try {
    // Only proceed if MongoDB is configured
    if (!mongoDb.isConnected()) {
      console.log('MongoDB not connected, skipping vector storage');
      return;
    }
    
    // Create embedding from image description
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textDescription
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const embedding = data.data[0].embedding;
    
    // Store in MongoDB vector collection
    const db = mongoDb.getDb();
    const collection = db.collection('rag_vectors');
    
    await collection.insertOne({
      userId,
      conversationId,
      type: 'image',
      text: textDescription,
      identifier: imageIdentifier,
      embedding,
      metadata: {
        type: 'image_description'
      },
      createdAt: new Date()
    });
    
    console.log('Image description added to MongoDB vector collection');
  } catch (error) {
    console.error('Error adding image to MongoDB:', error);
  }
}

export function registerImageRoutes(app: Express) {
  // Upload a new image
  app.post('/api/upload-image', isAuthenticated, upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Get the image data and userId
      const imageBuffer = req.file.buffer;
      const mimeType = req.file.mimetype;
      const userId = (req.user as any)?.id;
      const conversationId = parseInt(req.body.conversationId || '0');
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' });
      }
      
      // Upload image to storage
      const imageUrl = await imageStorage.uploadImage(imageBuffer, mimeType, userId);
      
      // Generate image description using multimodal model
      const textDescription = await generateImageDescription(imageUrl, userId);
      
      // Save image metadata in database
      const imageDescription = await storage.createImageDescription({
        conversationId,
        userId,
        imageIdentifier: imageUrl,
        textDescription,
        mimeType,
        fileSize: imageBuffer.length,
        type: 'image_description',
        metadata: { 
          width: req.body.width || null,
          height: req.body.height || null
        }
      });
      
      // Add to MongoDB vector collection for RAG if available
      await addImageToMongoDb(imageUrl, textDescription, userId, conversationId);
      
      res.status(201).json({
        success: true,
        imageUrl,
        imageDescription
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      res.status(500).json({ 
        error: 'Failed to upload image', 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get a specific image description by ID
  app.get('/api/image/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      
      const imageDescription = await storage.getImageDescription(imageId);
      
      if (!imageDescription) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Check if user has access to this image
      if (imageDescription.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.status(200).json(imageDescription);
    } catch (error) {
      console.error('Error getting image:', error);
      res.status(500).json({ error: 'Failed to get image' });
    }
  });
  
  // Get all images for a conversation
  app.get('/api/conversations/:id/images', isAuthenticated, async (req: Request, res: Response) => {
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
      
      const images = await storage.getImagesByConversation(conversationId);
      
      res.status(200).json(images);
    } catch (error) {
      console.error('Error getting images for conversation:', error);
      res.status(500).json({ error: 'Failed to get images' });
    }
  });
}