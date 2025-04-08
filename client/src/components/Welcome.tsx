import { Sparkles, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  creditBalance: number;
}

interface WelcomeProps {
  onSuggestionClick: (suggestion: string) => void;
  isLoading?: boolean;
}

// Static welcome paragraph that renders immediately for LCP optimization
export const StaticWelcomeParagraph = () => (
  <p className="text-lg text-muted-foreground mb-6 welcome-paragraph">
    Ask me anything and I'll provide helpful, accurate responses. Sign in to save your conversations and access them from any device.
  </p>
);

// The main Welcome component
export const Welcome = memo(({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  const [userDataLoaded, setUserDataLoaded] = useState(false);
  
  // Check if user is authenticated
  const { data: user, isSuccess, isError } = useQuery<User | null>({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return null;
          }
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        
        const userData = await response.json();
        return userData as User;
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    }
  });
  
  // Mark user data as loaded when query is settled (either success or error)
  useEffect(() => {
    if (isSuccess || isError) {
      setUserDataLoaded(true);
    }
  }, [isSuccess, isError]);

  const handleExampleClick = () => {
    if (isLoading) return;
    onSuggestionClick("Tell me more about your features and capabilities.");
  };
  
  // Split the component into two parts:
  // 1. The static content that renders immediately (for LCP)
  // 2. The animated content that appears after user data is loaded

  return (
    <div className="flex flex-col items-center justify-center mt-20 mb-10">
      {/* Static content for immediate rendering (LCP optimization) */}
      <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-4">
        <div className="mb-4">
          <Sparkles className="h-12 w-12 text-primary mb-2" />
        </div>
        <h1 className="text-3xl font-bold mb-4">
          Welcome to GloriaMundo!
        </h1>
        
        {/* Static paragraph that renders immediately - this is our LCP target */}
        <StaticWelcomeParagraph />
      </div>

      {/* Dynamic content that renders after user data is loaded */}
      {userDataLoaded && (
        <motion.div 
          className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {!user && (
            <div className="mb-6 p-4 bg-secondary/30 rounded-lg">
              <p className="flex items-center gap-2 text-md">
                <LogIn size={16} />
                <span>Sign in with Google in the top right corner to save your conversations.</span>
              </p>
            </div>
          )}
          
          <button
            onClick={handleExampleClick}
            disabled={isLoading}
            className="flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md transition-colors"
          >
            <Sparkles size={16} />
            <span>Try an example question</span>
          </button>
        </motion.div>
      )}
    </div>
  );
});

Welcome.displayName = 'Welcome';