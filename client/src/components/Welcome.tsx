import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface WelcomeProps {
  onSuggestionClick: (suggestion: string) => void;
  isLoading?: boolean;
}

export const Welcome = ({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  const [clickedSuggestion, setClickedSuggestion] = useState<string | null>(null);
  
  const suggestions = [
    "Tell me about the most recent scientific discovery",
    "What are the seven wonders of the natural world?",
    "Explain quantum computing to a 10-year-old",
    "Show me beautiful places to visit in Japan"
  ];
  
  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading || clickedSuggestion) return; // Prevent multiple clicks
    
    setClickedSuggestion(suggestion);
    onSuggestionClick(suggestion);
  };
  
  // Reset clicked suggestion when loading is complete
  useEffect(() => {
    if (!isLoading && clickedSuggestion) {
      setClickedSuggestion(null);
    }
  }, [isLoading, clickedSuggestion]);
  
  return (
    <motion.div 
      className="max-w-4xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 shadow-sm border-none">
        <CardContent className="p-6">
          <div className="flex items-center mb-4">
            <div className="h-12 w-12 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center text-white">
              <Globe className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-semibold">Welcome to GloriaMundo</h2>
              <p className="text-muted-foreground">Discover the joy of exploring our world through AI</p>
            </div>
          </div>
          
          <p className="mb-4">
            GloriaMundo uses the powerful Perplexity API with the sonar-reasoning model to help you explore and discover the wonders of our world. Ask me anything and let's embark on a journey of discovery together!
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
            {suggestions.map((suggestion, index) => {
              const isThisClicked = clickedSuggestion === suggestion;
              
              return (
                <Button
                  key={index}
                  variant="outline"
                  className={`h-auto py-3 px-4 bg-white hover:bg-gray-50 justify-start text-left relative overflow-hidden ${isThisClicked ? 'border-primary border-2' : ''}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                >
                  <span className="font-medium">{suggestion}</span>
                  
                  {/* Joyful loading indicator with sparkles */}
                  {isThisClicked && (
                    <div className="absolute right-3 flex items-center space-x-1 explore-animation">
                      <motion.div
                        animate={{ 
                          scale: [0.8, 1.2, 0.8],
                          opacity: [0.5, 1, 0.5],
                          transition: { duration: 1.5, repeat: Infinity }
                        }}
                        className="text-primary"
                      >
                        <Sparkles size={16} />
                      </motion.div>
                      <div className="explore-text text-primary">
                        <span className="text-sm">Exploring...</span>
                      </div>
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
