import express from "express";
import { registerRoutes } from "./routes.fixed";

async function startServer() {
  try {
    // Set up Express
    const app = express();
    app.use(express.json());
    
    // Register routes
    await registerRoutes(app);
    
    // Start server directly with app
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    
    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();