import { Express, Request, Response } from "express";
import { AbortController } from "node-abort-controller";

/**
 * This is a standalone implementation of the streaming route that doesn't depend
 * on the broken routes.ts file. It properly handles streaming with correct try/catch/finally blocks.
 */
export function registerStreamingRoute(app: Express): void {
  // Server-Sent Events endpoint for streaming chat responses
  app.get("/api/conversations/:id/messages/stream", async (req: Request, res: Response) => {
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    
    // Create abort controller for timeout handling
    const controller = new AbortController();
    const timeoutMs = 30000; // 30 seconds timeout
    
    // Set up a timeout to abort the request if it takes too long
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.log("Request timed out after", timeoutMs, "ms");
    }, timeoutMs);
    
    try {
      // Extract conversation ID and model parameters
      const conversationId = parseInt(req.params.id);
      const { content, modelType = "reasoning", modelId = "" } = req.query as {
        content?: string;
        modelType?: string;
        modelId?: string;
      };
      
      if (!content) {
        throw new Error("Message content is required");
      }
      
      // Mock API call (replace with actual API call to OpenRouter)
      const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      const apiKey = process.env.OPENROUTER_API_KEY;
      
      // Basic validation
      if (!apiKey) {
        throw new Error("API key not configured");
      }
      
      // Prepare the payload
      const payload = {
        model: modelId || "anthropic/claude-3-opus:beta", // Use the modelId if provided
        messages: [{ role: "user", content }],
        stream: true,
        temperature: 0.7
      };
      
      console.log("Calling streaming API with model:", modelId || "default");
      
      // Make the API request
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Check if response body exists
      if (!response.body) {
        throw new Error("Response body is null");
      }
      
      // Get a reader for the response stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        // Process the stream in chunks
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send end signal
            res.write("data: [DONE]\n\n");
            break;
          }
          
          // Decode the chunk
          const chunk = decoder.decode(value, { stream: true });
          
          // Process and forward the chunk
          res.write(`data: ${chunk}\n\n`);
        }
      } catch (streamError) {
        console.error("Stream processing error:", streamError);
        res.write(`data: ${JSON.stringify({ error: "Stream processing error" })}\n\n`);
      } finally {
        // Ensure we release the reader's lock
        reader.releaseLock();
        console.log("Stream reader lock released");
      }
      
    } catch (error) {
      console.error("Error in streaming endpoint:", error);
      
      // Clear the timeout if it's still active
      clearTimeout(timeoutId);
      
      // Send error to client
      res.write(`data: ${JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error"
      })}\n\n`);
    } finally {
      // Always end the response and clean up
      res.end();
      console.log("Streaming connection closed");
    }
  });
}