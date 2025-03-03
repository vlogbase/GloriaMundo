import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, lazy, Suspense, memo } from "react";
import { Logo } from "@/components/Logo";

interface WelcomeProps {
  onSuggestionClick: (suggestion: string) => void;
  isLoading?: boolean;
}

// Memoized Button component for better performance
const SuggestionButton = memo(({ 
  suggestion, 
  isThisClicked, 
  isLoading,
  onClick 
}: { 
  suggestion: string;
  isThisClicked: boolean;
  isLoading: boolean;
  onClick: () => void;
}) => (
  <Button
    variant="outline"
    className={`suggestion-button w-full h-auto py-4 px-5 bg-card hover:bg-muted justify-start text-left relative 
               overflow-visible shadow-sm transition-all duration-200 
               ${isThisClicked 
                 ? 'border-primary border-2 bg-primary/5' 
                 : 'hover:shadow hover:border-primary/40'}`}
    onClick={onClick}
    disabled={isLoading}
  >
    <div className="flex justify-between w-full items-start">
      <div className="suggestion-content font-medium text-sm md:text-base pr-6 text-left break-words">{suggestion}</div>
      
      {/* Joyful loading indicator with sparkles */}
      {isThisClicked ? (
        <div className="flex-shrink-0 flex items-center space-x-1 explore-animation">
          <motion.div
            animate={{ 
              scale: [0.8, 1.2, 0.8],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity 
            }}
            className="text-primary"
          >
            <Sparkles size={16} />
          </motion.div>
          <div className="explore-text text-primary hidden sm:block">
            <span className="text-sm">Exploring...</span>
          </div>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="text-primary/60"
        >
          <Logo size={18} />
        </motion.div>
      )}
    </div>
  </Button>
));

SuggestionButton.displayName = 'SuggestionButton';

// The main Welcome component
export const Welcome = memo(({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  const [clickedSuggestion, setClickedSuggestion] = useState<string | null>(null);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<string[]>([]);
  
  // Only include the top 8 most relevant suggestions to reduce initial bundle size
  const topSuggestions = [
    "What's a small joy I could add to my morning routine?",
    "Suggest a fun outdoor activity for this weekend based on the weather forecast.",
    "What are the happiest places to visit in the world?",
    "How can I bring more color into my living space without a major renovation?",
    "What's a simple recipe that brings people together?",
    "Show me creative ways people are spreading kindness today.",
    "What beautiful natural phenomena can I see this month?",
    "Which books are bringing readers the most joy this year?"
  ];
  
  // Lazy load the full suggestions list
  const [fullSuggestionsLoaded, setFullSuggestionsLoaded] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState(topSuggestions);
  
  // Load full suggestions when component is mounted
  useEffect(() => {
    // Only load full suggestions if not already loaded
    if (!fullSuggestionsLoaded) {
      const additionalSuggestions = [
        "What's a simple craft I could make with items already in my home?",
        "How are people celebrating the upcoming season in joyful ways?",
        "What hobby has the best community for beginners to join?",
        "What positive environmental changes are happening right now?",
        "Which simple stretches could make my workday more pleasant?",
        "What's a delightful tradition from another culture I could learn about?",
        "Show me inspiring stories of everyday heroes from this week.",
        "What's a fun way to learn something new in just 10 minutes a day?",
        "What mindfulness practice brings the most joy to beginners?",
        "What unexpected ingredients are chefs using to create amazing flavors this season?",
        "Which tech tools are helping people connect more meaningfully?",
        "What's a simple way to bring more music into my daily routine?",
        "What's an efficient way to organize my kitchen that makes cooking more enjoyable?",
        "Which houseplants thrive with minimal care but brighten a space?",
        "What are some budget-friendly day trips worth taking?",
        "How can I transform my commute time into something I look forward to?",
        "What small kitchen gadget makes the biggest difference in meal preparation?",
        "Which fabrics are both comfortable and durable for everyday furniture?",
        "What's a 15-minute exercise routine that energizes rather than exhausts?",
        "How can I make my workspace more ergonomic and visually pleasing?",
        "What are some easy ways to personalize gift-giving without spending more?",
        "Which simple maintenance tasks prevent bigger headaches for homeowners?",
        "What are some versatile ingredients worth keeping stocked in my pantry?",
        "How can I improve my sleep environment without buying a new mattress?",
        "What digital tools help people organize their thoughts more effectively?",
        "Which podcast genres are people finding most engaging on their daily walks?",
        "What's a low-maintenance outdoor plant that attracts butterflies or birds?",
        "How are people repurposing everyday items to reduce waste creatively?",
        "What activities help build meaningful connections with neighbors?",
        "Which seasonal foods are at their peak flavor right now?",
        "What's a simple photography technique that transforms ordinary moments?",
        "How can I create a relaxing evening routine that improves my next day?"
      ];
      
      // Use a timeout to prioritize initial render first
      setTimeout(() => {
        setAllSuggestions([...topSuggestions, ...additionalSuggestions]);
        setFullSuggestionsLoaded(true);
      }, 100);
    }
  }, [fullSuggestionsLoaded]);
  
  // Randomly select 4 unique suggestions
  useEffect(() => {
    const getRandomSuggestions = () => {
      // Shuffle array and pick first 4
      const shuffled = [...allSuggestions].sort(() => 0.5 - Math.random());
      setDisplayedSuggestions(shuffled.slice(0, 4));
    };
    
    getRandomSuggestions();
  }, [allSuggestions]);
  
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
      className="w-full max-w-4xl mx-auto px-1 sm:px-0"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 shadow-sm border-none">
        <CardContent className="p-6">
          <div className="flex items-center mb-4">
            <div className="h-12 w-12 flex items-center justify-center">
              <Logo size={42} />
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-semibold">Welcome to GloriaMundo</h2>
            </div>
          </div>
          
          <p className="mb-4">
            Curiosity meets clarity. GloriaMundo: the conversational agent that transforms questions into adventures.
          </p>
          
          <div className="space-y-4 mt-6">
            {displayedSuggestions.map((suggestion, index) => {
              const isThisClicked = clickedSuggestion === suggestion;
              
              return (
                <SuggestionButton
                  key={index}
                  suggestion={suggestion}
                  isThisClicked={isThisClicked}
                  isLoading={isLoading}
                  onClick={() => handleSuggestionClick(suggestion)}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

Welcome.displayName = 'Welcome';
