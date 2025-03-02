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
  const [displayedSuggestions, setDisplayedSuggestions] = useState<string[]>([]);
  
  // All possible suggestions
  const allSuggestions = [
    "What's a small joy I could add to my morning routine?",
    "Suggest a fun outdoor activity for this weekend based on the weather forecast.",
    "What are the happiest places to visit in the world?",
    "How can I bring more color into my living space without a major renovation?",
    "What's a simple recipe that brings people together?",
    "Show me creative ways people are spreading kindness today.",
    "What beautiful natural phenomena can I see this month?",
    "Which books are bringing readers the most joy this year?",
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
  
  // Randomly select 4 unique suggestions when component mounts or is revisited
  useEffect(() => {
    const getRandomSuggestions = () => {
      // Shuffle array and pick first 4
      const shuffled = [...allSuggestions].sort(() => 0.5 - Math.random());
      setDisplayedSuggestions(shuffled.slice(0, 4));
    };
    
    getRandomSuggestions();
  }, []);
  
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
            {displayedSuggestions.map((suggestion, index) => {
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
