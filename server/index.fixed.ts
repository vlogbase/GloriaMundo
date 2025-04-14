import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.fixed";
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

// Parse cookies
app.use(cookieParser());

// Parse JSON request bodies
app.use(express.json());

// Create PostgreSQL session store
const PostgreSqlStore = pgSession(session);

// Configure session middleware
app.use(
  session({
    store: new PostgreSqlStore({
      pool: db.execute.getPool(),
      tableName: 'sessions',
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport to use Google OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://gloriamundo.com/auth/google/callback';

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create user based on Google ID
        const existingUser = await db.select().from(users).where(eq(users.googleId, profile.id)).limit(1);
        
        if (existingUser.length > 0) {
          // Update user info if needed (e.g., new profile photo)
          return done(null, existingUser[0]);
        } else {
          // Create a new user
          const newUser = await db.insert(users).values({
            googleId: profile.id,
            email: profile.emails?.[0]?.value || '',
            name: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value || '',
            creditBalance: 500, // Give new users 500 credits (worth $0.05) to start
          }).returning();
          
          return done(null, newUser[0]);
        }
      } catch (error) {
        return done(error as Error);
      }
    }
  )
);

// Configure user serialization/deserialization
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
    done(null, user[0] || null);
  } catch (error) {
    done(error, null);
  }
});

// Set up Vite for the frontend
setupVite(app);

// Google OAuth routes
app.get('/auth/google', passport.authenticate('google'));

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    successRedirect: '/',
    failureRedirect: '/login',
  })
);

// Logout route
app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// User info route
app.get('/api/user', (req, res) => {
  if (req.user) {
    // Return user info without sensitive data
    const userInfo = { ...(req.user as any) };
    delete userInfo.password;
    res.json(userInfo);
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

// Register API routes and start the server
async function startServer() {
  try {
    const server = await registerRoutes(app);
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      log.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    log.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();