import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { registerStreamingRoute } from './streamingRoutes';

/**
 * This is a standalone server that only implements the streaming route.
 * It doesn't depend on the broken routes.ts file.
 */
async function startStreamingServer() {
  const app = express();
  
  // Set up middleware
  app.use(express.json());
  app.use(cors());
  
  // Basic health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Streaming server is running' });
  });
  
  // Register the streaming route
  registerStreamingRoute(app);
  
  // Start the server
  const port = process.env.PORT || 3000;
  const server = createServer(app);
  
  server.listen(port, '0.0.0.0', () => {
    console.log(`Streaming server running on port ${port}`);
  });
  
  return server;
}

// Start the server
startStreamingServer().catch((error) => {
  console.error('Failed to start streaming server:', error);
  process.exit(1);
});