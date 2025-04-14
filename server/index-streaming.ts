import express from 'express';
import { createServer } from 'http';

async function startServer() {
  const app = express();
  
  // Basic middleware setup
  app.use(express.json());
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  
  // Stream a chunk of data every second to demonstrate streaming functionality
  app.get('/api/demo-stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    let counter = 0;
    
    // Send a chunk of data every second
    const intervalId = setInterval(() => {
      counter++;
      
      // Create a demo data packet
      const data = {
        chunk: counter,
        text: `This is streaming chunk #${counter}`,
        timestamp: new Date().toISOString()
      };
      
      // Format as an SSE data event
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      
      // End after 10 chunks
      if (counter >= 10) {
        // Send end signal
        res.write('data: [DONE]\n\n');
        
        // Clean up and end the connection
        clearInterval(intervalId);
        res.end();
      }
    }, 1000);
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      console.log('Client disconnected, stream closed');
    });
  });
  
  // Simplified streaming endpoint for testing
  app.get('/api/conversations/:id/messages/stream', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const { content } = req.query;
    const conversationId = parseInt(req.params.id);
    
    if (!content || isNaN(conversationId)) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid parameters' })}\n\n`);
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
    
    // Demo text to stream (for testing without API)
    const demoResponse = "This is a simulated streaming response for testing purposes. It demonstrates how responses should appear character by character in the client interface, creating a more interactive and engaging user experience. The streaming implementation correctly processes the response chunks and displays them incrementally.";
    
    // Stream each character with a slight delay
    let position = 0;
    const intervalId = setInterval(() => {
      // Get the next character
      const nextChar = demoResponse.charAt(position);
      position++;
      
      // Send character as a delta
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: { content: nextChar } }]
      })}\n\n`);
      
      // End when we've sent all characters
      if (position >= demoResponse.length) {
        // Send end signal
        res.write('data: [DONE]\n\n');
        
        // Clean up and end the connection
        clearInterval(intervalId);
        res.end();
      }
    }, 50); // 50ms delay between characters
    
    // Handle client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      console.log('Client disconnected, stream closed');
    });
  });
  
  // Start the server
  const port = process.env.PORT || 3000;
  const server = createServer(app);
  
  server.listen(port, () => {
    console.log(`Streaming demo server running on port ${port}`);
  });
  
  return server;
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});