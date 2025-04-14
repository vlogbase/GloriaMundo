import express, { type Request, Response, NextFunction } from "express";
import { registerMinimalRoutes } from "./minimal-routes";
import { setupVite, serveStatic, log } from "./vite";
import cookieParser from "cookie-parser";
import compression from "compression";

const app = express();

// Trust the proxy headers set by Replit
app.set('trust proxy', 1);

// Enable Gzip compression for all responses
app.use(compression());

// Increase the request size limit for JSON and URL encoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  
  next();
});

(async () => {
  // Register minimal routes instead of the broken routes.ts
  const server = await registerMinimalRoutes(app);

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Global error handler:', err);
    
    // Fallback error response
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  // Set up Vite for development
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start the server
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Minimal server running on port ${port}`);
  });
})();