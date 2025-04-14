import express from 'express';
import { streamingEndpoint } from './streaming-fixed';

async function startServer() {
  const app = express();
  
  // Basic middleware setup
  app.use(express.json());
  
  // Register the fixed streaming endpoint
  streamingEndpoint(app);
  
  // Start the server
  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});