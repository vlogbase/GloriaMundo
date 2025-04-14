import express from "express";
import { registerRoutes } from "./routes.temp";

async function startServer() {
  try {
    // Set up Express
    const app = express();
    app.use(express.json());
    
    // Register routes
    await registerRoutes(app);
    
    // Start server
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();