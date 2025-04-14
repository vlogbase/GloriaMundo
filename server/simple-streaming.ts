/**
 * Simple standalone streaming server for GloriaMundo
 * This implementation is fully ES module compatible
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory path in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Start the simple streaming server
const startSimpleStreamingServer = async () => {
  const app = express();
  
  // Configure middleware
  app.use(express.json({ limit: '50mb' }));
  
  // Add CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Simple streaming server is running' });
  });
  
  // Streaming endpoint
  app.get('/api/conversations/:id/messages/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Extract conversation ID and message parameters
    const conversationId = parseInt(req.params.id);
    const { content, modelType = 'reasoning', modelId = '' } = req.query as {
      content?: string;
      modelType?: string;
      modelId?: string;
    };
    
    // Basic validation
    if (!content) {
      res.write(`data: ${JSON.stringify({ error: 'Message content is required' })}\n\n`);
      res.end();
      return;
    }
    
    console.log(`Streaming conversation ${conversationId} with content: ${content}`);
    
    // Create a message ID
    const messageId = Date.now();
    
    // Send initial message with ID
    res.write(`data: ${JSON.stringify({
      id: messageId,
      choices: [{ delta: { content: '' } }]
    })}\n\n`);
    
    // Demo text to stream
    const responseText = "I'm demonstrating streaming functionality in this chat application. The text appears character by character, providing a more engaging experience than waiting for the entire message. This approach mimics real-time interaction, similar to how a person types or speaks.";
    
    // Stream each character with a slight delay
    let position = 0;
    const intervalId = setInterval(() => {
      // Get the next character
      const nextChar = responseText.charAt(position);
      position++;
      
      // Send character as a delta update
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: { content: nextChar } }]
      })}\n\n`);
      
      // End when we've sent all characters
      if (position >= responseText.length) {
        // Send end signal
        res.write('data: [DONE]\n\n');
        
        // Clean up and end the connection
        clearInterval(intervalId);
        res.end();
        console.log('Streaming complete for message ID:', messageId);
      }
    }, 50); // 50ms delay between characters
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      console.log('Client disconnected, stream closed');
    });
  });
  
  // Serve a simple demo page
  app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'streaming-demo.html'));
  });
  
  // Start the server
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5001;
  const server = createServer(app);
  
  server.listen(port, () => {
    console.log(`Simple streaming server running on port ${port}`);
  });
  
  return server;
};

// Auto-start the server
startSimpleStreamingServer().catch(error => {
  console.error('Failed to start simple streaming server:', error);
});