// This is a temporary file to use while we debug and fix the main file

import { Express, Request, Response, NextFunction } from "express";
import { Server } from "http";

// Mock types and utilities for testing
const storage = {
  getConversation: async (id: number) => ({ id, userId: 1, title: "Test conversation" }),
  getMessagesByConversation: async (id: number) => []
};

// Mock model configs
const MODEL_CONFIGS = {
  reasoning: {
    apiProvider: "openrouter",
    modelName: "test-model",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: "test-key"
  }
};

// Mock functions
const isValidApiKey = (key: string) => true;
const findSimilarChunks = async (query: string, conversationId: number) => ({ chunks: [], documents: [] });
const formatContextForPrompt = (chunks: any[], documents: any[]) => "";
const parseOpenRouterError = (status: number, text: string) => ({ message: "Error", category: "error", status: 500, userMessage: "Error" });
const generateAndSaveConversationTitle = async (id: number) => {};

// For authentication
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => next();

export async function registerRoutes(app: Express): Promise<void> {
  // Setup bare-bones streaming endpoint
  app.get("/api/conversations/:id/messages/stream", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content = "", modelType = "reasoning", modelId = "" } = req.query as {
        content?: string;
        modelType?: string;
        modelId?: string;
      };
      
      if (!content) {
        return res.status(400).json({ message: "Message content is required" });
      }
      
      // Get the model configuration
      const modelConfig = MODEL_CONFIGS.reasoning;
      
      // Set headers for SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      
      try {
        // Make the API request
        const response = await fetch(modelConfig.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${modelConfig.apiKey}`
          },
          body: JSON.stringify({
            model: modelConfig.modelName,
            messages: [{ role: "user", content }],
            stream: true
          })
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        // Process the stream using a reader
        if (!response.body) {
          throw new Error("Response body is null");
        }
        
        const reader = response.body.getReader();
        
        try {
          // Process stream in a loop
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              res.write('data: [DONE]\n\n');
              break;
            }
            
            // Convert the chunk to string and forward it
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                res.write(line + '\n\n');
              }
            }
          }
        } catch (streamError) {
          console.error("Error processing stream:", streamError);
          res.write(`data: {"error": "Stream processing error"}\n\n`);
        } finally {
          // Clean up
          reader.releaseLock();
          res.end();
        }
      } catch (error) {
        console.error("API request error:", error);
        res.write(`data: {"error": "API request failed"}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error('Server streaming error:', error);
      res.status(500).json({ message: "Failed to process streaming message" });
    }
  });
  
  // Return to satisfy the interface
  return;
}