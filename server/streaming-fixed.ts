// Corrected implementation of the streaming endpoint
import { Express, Request, Response } from "express";
import { AbortController } from "node-abort-controller";
import fetch from "node-fetch";

/**
 * Fixed implementation of the streaming endpoint with proper try/catch/finally blocks
 */
export function streamingEndpoint(app: Express): void {
  app.post("/api/conversations/:id/messages/stream", async (req: Request, res: Response) => {
    let controller: AbortController | null = new AbortController();
    
    // Set up headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Flush the headers to establish SSE with client
    
    try {
      // Main processing logic
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        throw new Error("Invalid conversation ID");
      }
      
      // API call logic
      try {
        // Example API call similar to OpenRouter streaming
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-opus:beta",
            messages: [{ role: "user", content: "Hello" }],
            stream: true
          }),
          signal: controller.signal
        });
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        
        if (!response.body) {
          throw new Error("API response body is null");
        }
        
        // Properly handle the stream with async reader
        // Critical fix: Use proper ReadableStream reading method instead of incompatible pipe
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        try {
          let isFirstChunk = true;
          
          // Properly reading the stream with while loop
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            // Process the chunk
            const chunk = decoder.decode(value, { stream: true });
            console.log("Chunk received:", chunk);
            
            // For SSE, format each chunk as an event
            // Send updated data as Server-Sent Events
            res.write(`data: ${chunk}\n\n`);
            
            // Special processing for first chunk if needed
            if (isFirstChunk) {
              isFirstChunk = false;
              console.log("First chunk processed");
            }
          }
        } catch (streamError) {
          console.error("Stream processing error:", streamError);
          throw streamError;
        } finally {
          // Clean up resources properly
          reader.releaseLock();
          console.log("Stream reader lock released");
        }
        
      } catch (apiError) {
        console.error("API error:", apiError);
        // Send an error event to the client
        res.write(`data: ${JSON.stringify({ error: "API error occurred" })}\n\n`);
      }
      
    } catch (error) {
      console.error("Server error:", error);
      // Send an error event to the client
      res.write(`data: ${JSON.stringify({ error: "Server error occurred" })}\n\n`);
    } finally {
      // Critical: This finally block ensures proper cleanup
      // Ensure we abort any pending request
      if (controller) {
        controller.abort();
        controller = null;
      }
      
      // End the response stream
      res.end();
      console.log("Stream ended");
    }
  });
}