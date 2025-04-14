import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from "express-session";
import cookieParser from "cookie-parser";
import pgSession from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import compression from "compression";

const app = express();
// Trust the proxy headers set by Replit (to fix https redirect issues)
app.set('trust proxy', 1);

// Enable Gzip compression for all responses
app.use(compression({
  // Only compress responses for requests that have the following headers
  filter: (req, res) => {
    // Don't compress responses with this header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression filter function from the module
    return compression.filter(req, res);
  },
  // Set compression level (0-9, where 9 is highest compression but slowest)
  level: 6,
}));

// Set appropriate cache headers for static assets
app.use((req, res, next) => {
  // Skip API routes and only apply to static assets
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  // Apply different cache control headers based on file type
  const path = req.path.toLowerCase();
  
  if (path.endsWith('.html')) {
    // HTML files - shorter cache (users need fresh content)
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else if (path.match(/\.(js|css|json)$/)) {
    // JS/CSS files - cache for 1 week with revalidation
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  } else if (path.match(/\.(jpg|jpeg|png|gif|webp|ico|svg|woff2|woff|ttf|eot)$/)) {
    // Static assets - cache for 1 month
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  } else if (!path.includes('.')) {
    // Routes without file extensions (likely React routes) - no caching
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else {
    // Other files - cache for 1 day
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
  
  next();
});

// Increase the request size limit for JSON and URL encoded data to handle larger images
// Default is 100kb, increasing to 50MB for multimodal content
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

// Create PostgreSQL session store
const PgSessionStore = pgSession(session);

// Set up session middleware with PostgreSQL store
app.use(session({
  store: new PgSessionStore({
    conObject: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    },
    tableName: 'session', // Default session table name
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'gloriamundo-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    // Only set secure flag when not in development/local environment
    secure: process.env.NODE_ENV === 'production', 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax'
  }
}));

// Initialize passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization/deserialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id)
    });
    done(null, user || false);
  } catch (err) {
    done(err, false);
  }
});

// Set up Google OAuth strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL: '/auth/google/callback',
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.googleId, profile.id)
    });

    if (existingUser) {
      // User exists, return the user
      return done(null, existingUser);
    }

    // Create new user
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
    const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : '';
    
    const [newUser] = await db.insert(users)
      .values({
        googleId: profile.id,
        email,
        name: profile.displayName,
        avatarUrl
      })
      .returning();

    return done(null, newUser);
  } catch (error) {
    return done(error as Error);
  }
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Import document routes explicitly first to ensure they're registered before Vite catch-all middleware
  const { registerDocumentRoutes } = await import('./documentRoutes');
  registerDocumentRoutes(app);
  
  // Now register the rest of the routes
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Global error handler:', err);
    
    // Use our centralized error handling system
    import('./errorHandler').then(({ handleInternalError, sendErrorResponse }) => {
      const apiError = handleInternalError(err, 'application');
      
      // Send the standardized error response
      sendErrorResponse(res, apiError);
    }).catch(importError => {
      console.error('Failed to import error handler:', importError);
      
      // Fallback error response if error handler import fails
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    
    // Don't rethrow the error as it will crash the server
    // The error is already logged above
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
