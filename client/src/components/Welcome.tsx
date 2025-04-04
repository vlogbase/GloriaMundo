import { Sparkles, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { memo } from "react";
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

// The main Welcome component
export const Welcome = memo(({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  // Check if user is authenticated
  const { data: user } = useQuery<User | null>({
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

  const handleExampleClick = () => {
    if (isLoading) return;
    onSuggestionClick("Tell me more about your features and capabilities.");
  };
  
  return (
    <motion.div 
      className="flex flex-col items-center justify-center mt-20 mb-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-4">
        <div className="mb-4">
          <Sparkles className="h-12 w-12 text-primary mb-2" />
        </div>
        <h1 className="text-3xl font-bold mb-4">
          {user ? `Welcome back, ${user.name}!` : 'Welcome to GloriaMundo!'}
        </h1>
        <p className="text-lg text-muted-foreground mb-6">
          {user 
            ? "Your conversations are now being saved to your account. Ask me anything and I'll provide helpful, accurate responses." 
            : "Sign in to save your conversations and access them from any device. Ask me anything and I'll provide helpful, accurate responses."
          }
        </p>
        
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
      </div>
    </motion.div>
  );
});

Welcome.displayName = 'Welcome';