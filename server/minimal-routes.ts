import { Express, Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";

// Minimal authentication middleware that accepts all requests
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => next();

/**
 * This is a minimal routes file with no dependencies on the broken routes.ts
 * It only implements the streaming endpoint for demonstration
 */
export async function registerMinimalRoutes(app: Express): Promise<Server> {
  // Set up some basic API routes
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Minimal routes server is running" });
  });
  
  // Test conversation route
  app.get("/api/conversations", (req, res) => {
    res.json([
      { 
        id: 1, 
        title: "Test Conversation", 
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: null
      }
    ]);
  });
  
  // Test messages route
  app.get("/api/conversations/:id/messages", (req, res) => {
    const conversationId = parseInt(req.params.id);
    res.json([
      {
        id: 1,
        conversationId,
        role: "system",
        content: "I'm GloriaMundo, an AI assistant ready to help you.",
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        conversationId,
        role: "user",
        content: "Hello! Can you help me with some information?",
        createdAt: new Date().toISOString()
      },
      {
        id: 3,
        conversationId,
        role: "assistant",
        content: "Hello! I'd be happy to help you with information. What would you like to know?",
        createdAt: new Date().toISOString()
      }
    ]);
  });
  
  // Streaming endpoint
  app.get("/api/conversations/:id/messages/stream", (req, res) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    
    const { content } = req.query;
    const conversationId = parseInt(req.params.id);
    
    if (!content || isNaN(conversationId)) {
      res.write(`data: ${JSON.stringify({ error: "Invalid parameters" })}\n\n`);
      res.end();
      return;
    }
    
    console.log(`Streaming conversation ${conversationId} with content: ${content}`);
    
    // Create a message ID
    const messageId = Date.now();
    
    // Send initial message with ID
    res.write(`data: ${JSON.stringify({
      id: messageId,
      choices: [{ delta: { content: "" } }]
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
        res.write("data: [DONE]\n\n");
        
        // Clean up and end the connection
        clearInterval(intervalId);
        res.end();
      }
    }, 50); // 50ms delay between characters
    
    // Handle client disconnect
    req.on("close", () => {
      clearInterval(intervalId);
      console.log("Client disconnected, stream closed");
    });
  });

  // Create HTTP server
  const server = createServer(app);
  return server;
}