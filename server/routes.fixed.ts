import { Express, Request, Response, NextFunction } from "express";
import { createServer, Server } from "http";
import { storage } from "./storage";

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session && req.session.passport && req.session.passport.user) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Register the routes
  
  // Streaming endpoint for chat messages
  app.get("/api/conversations/:id/messages/stream", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id, 10);
      
      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      // Start with a heartbeat
      res.write("event: heartbeat\ndata: {}\n\n");
      
      // Create a text encoder
      const encoder = new TextEncoder();
      
      // Example mock response - in a real implementation, this would be a stream from an AI service
      const mockStreamResponse = new ReadableStream({
        start(controller) {
          const messages = [
            "Hello, ",
            "this ",
            "is ",
            "a ",
            "streaming ",
            "response ",
            "from ",
            "the ",
            "server!"
          ];
          
          let index = 0;
          
          // Add messages every 200ms
          const interval = setInterval(() => {
            if (index < messages.length) {
              controller.enqueue(encoder.encode(messages[index]));
              index++;
            } else {
              clearInterval(interval);
              controller.close();
            }
          }, 200);
        }
      });
      
      // Get reader from the stream
      const reader = mockStreamResponse.getReader();
      
      // Process the stream
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log("Stream complete");
            break;
          }
          
          // Decode the chunk
          const chunk = new TextDecoder().decode(value);
          console.log("Sending chunk:", chunk);
          
          // Format as SSE
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          // Flush the response to ensure immediate delivery
          res.flush?.();
        }
      } finally {
        // Always release the reader lock and end the response
        reader.releaseLock();
        res.end();
      }
      
    } catch (error) {
      console.error("Error in streaming endpoint:", error);
      // If we haven't sent headers yet, send error response
      if (!res.headersSent) {
        res.status(500).json({ message: "Error processing stream" });
      } else {
        // If headers were sent, end the stream with an error event
        res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream processing error" })}\n\n`);
        res.end();
      }
    }
  });
  
  // Create the HTTP server
  const server = createServer(app);
  return server;
}