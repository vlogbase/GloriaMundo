/**
 * This is a simplified server index file that's compatible with our streaming implementation
 */
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { setupVite, serveStatic, log } from "./vite";
import cookieParser from "cookie-parser";
import compression from "compression";

async function startServer() {
  const app = express();
  
  // Trust the proxy headers
  app.set('trust proxy', 1);
  
  // Enable compression
  app.use(compression());
  
  // Increase the request size limit
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));
  app.use(cookieParser());
  
  // Add a basic health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
  });
  
  // Our streaming demo endpoint for testing
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
  
  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Global error handler:', err);
    
    // Fallback error response
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });
  
  // Setup Vite (development) or serve static files (production)
  const server = createServer(app);
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  
  // Start server
  const port = 5000;
  server.listen(port, "0.0.0.0", () => {
    log(`Simplified server running on port ${port}`);
  });
  
  return server;
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});