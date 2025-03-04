import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, memo } from "react";
import { useModelSelection } from "@/hooks/useModelSelection";
import { ModelType } from "@/lib/types";

interface WelcomeProps {
  onSuggestionClick: (suggestion: string) => void;
  isLoading?: boolean;
}

interface SuggestionData {
  shortQuestion: string;
  fullQuestion: string;
  modelTypes: ModelType[];
}

// The suggestions data from CSV
const SUGGESTIONS_DATA: SuggestionData[] = [
  { 
    shortQuestion: "Next Prime Number?", 
    fullQuestion: "Consider the following sequence: 2, 3, 5, 7, 11. What is the next prime number? Please explain your reasoning step by step.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Solve the riddle", 
    fullQuestion: 'Solve the riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" Provide clues and detailed reasoning.',
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Assign pets logically", 
    fullQuestion: "In a logic puzzle, three friends—Alex, Bob, and Carol—each own a different pet: a cat, a dog, and a bird. Given that Alex does not own the bird and Bob is allergic to cats, determine who owns which pet using step-by-step deductions.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Prove √2 irrational", 
    fullQuestion: "Prove that the square root of 2 is irrational by using a proof by contradiction. Clearly outline each logical step in your explanation.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Analyze argument logic", 
    fullQuestion: 'Analyze the argument: "If it rains, the ground gets wet. The ground is wet, therefore it rained." Identify any logical fallacies or assumptions and discuss the validity of this reasoning.',
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Solve arithmetic puzzle", 
    fullQuestion: "Solve this arithmetic puzzle: If 5 + 3 = 28 and 9 + 1 = 910, determine what 7 + 3 equals. Explain your reasoning and the pattern behind these equations.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Swan color question", 
    fullQuestion: 'Consider the statement: "All swans are white." If a single black swan is observed, what does that imply about the statement? Discuss your reasoning process.',
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Predict Fibonacci numbers", 
    fullQuestion: "Given the Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, predict the next two numbers and explain how the sequence is generated.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Moral dilemma analysis", 
    fullQuestion: 'Debate the moral dilemma: "Is it ever justifiable to lie in order to protect someone\'s feelings?" Present a structured argument, including pros and cons.',
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "Chess endgame strategy", 
    fullQuestion: "In a simplified chess endgame with only a king and pawn, explain the strategy required to promote the pawn into a queen, detailing each necessary move.",
    modelTypes: ["reasoning", "multimodal"]
  },
  { 
    shortQuestion: "2023 IPCC Report Summary", 
    fullQuestion: "Find and summarize the key findings of the 2023 IPCC report on climate change, including major recommendations and data trends.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Internet usage 2024?", 
    fullQuestion: "Search for current statistics on global internet usage in 2024 and analyze the trends and implications based on recent reports.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Renewable breakthroughs?", 
    fullQuestion: "Identify the top three renewable energy breakthroughs of the past year and explain their potential impact on energy markets.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "EV battery advancements", 
    fullQuestion: "Locate a detailed review of the latest advancements in electric vehicle battery technology, and summarize how these improvements compare to previous generations.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Cybersecurity threats 2024", 
    fullQuestion: "Find a comprehensive report on current cybersecurity threats in 2024, including recommended mitigation strategies and analysis.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Mars rover news", 
    fullQuestion: "Search for the latest updates on Mars rover missions and discoveries, summarizing the key news and findings from recent space exploration efforts.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Global economic trends", 
    fullQuestion: "Locate a detailed analysis of global economic trends in 2024, highlighting key sectors driving growth and current challenges.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "AI in healthcare?", 
    fullQuestion: "Search for current data on the adoption of AI technologies in healthcare and explain how these advancements are transforming patient care.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Digital privacy laws", 
    fullQuestion: "Find recent insights on digital privacy laws around the world and discuss how evolving regulations impact technology companies.",
    modelTypes: ["search"]
  },
  { 
    shortQuestion: "Tech legal cases", 
    fullQuestion: "Locate updates on major legal cases involving tech companies, summarizing the controversies, legal arguments, and outcomes.",
    modelTypes: ["search"]
  }
];

// Individual suggestion bubble component
const SuggestionBubble = memo(({ 
  suggestion, 
  isClicked,
  isLoading, 
  onClick 
}: { 
  suggestion: string;
  isClicked: boolean;
  isLoading: boolean;
  onClick: () => void;
}) => {
  return (
    <motion.button
      className={`px-4 py-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-all
                 text-sm md:text-base cursor-pointer shadow-sm
        ${isClicked ? "bg-primary/30 text-primary font-medium" : ""}
        ${isLoading ? "opacity-50 cursor-not-allowed" : ""}
      `}
      disabled={isLoading}
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{suggestion}</span>
        
        {isClicked && (
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
            <Sparkles size={14} />
          </motion.div>
        )}
      </div>
    </motion.button>
  );
});

SuggestionBubble.displayName = 'SuggestionBubble';

// The main Welcome component
export const Welcome = memo(({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  const [clickedSuggestionId, setClickedSuggestionId] = useState<number | null>(null);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<SuggestionData[]>([]);
  const { selectedModel } = useModelSelection();
  
  // Get suggestions appropriate for the current model
  useEffect(() => {
    const getRandomSuggestionsForModel = () => {
      // Filter suggestions applicable to the current model
      const filteredSuggestions = SUGGESTIONS_DATA.filter(suggestion => 
        suggestion.modelTypes.includes(selectedModel)
      );
      
      // Shuffle array and pick first 4
      const shuffled = [...filteredSuggestions].sort(() => 0.5 - Math.random());
      setDisplayedSuggestions(shuffled.slice(0, 4));
    };
    
    getRandomSuggestionsForModel();
  }, [selectedModel]);
  
  const handleSuggestionClick = (index: number, suggestion: SuggestionData) => {
    if (isLoading || clickedSuggestionId !== null) return; // Prevent multiple clicks
    
    setClickedSuggestionId(index);
    onSuggestionClick(suggestion.fullQuestion);
  };
  
  // Reset clicked suggestion when loading is complete
  useEffect(() => {
    if (!isLoading && clickedSuggestionId !== null) {
      setClickedSuggestionId(null);
    }
  }, [isLoading, clickedSuggestionId]);
  
  return (
    <motion.div 
      className="flex flex-col items-center justify-center mt-20 mb-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-2xl">
        {displayedSuggestions.map((suggestion, index) => {
          const isThisClicked = clickedSuggestionId === index;
          
          return (
            <SuggestionBubble
              key={index}
              suggestion={suggestion.shortQuestion}
              isClicked={isThisClicked}
              isLoading={isLoading}
              onClick={() => handleSuggestionClick(index, suggestion)}
            />
          );
        })}
      </div>
    </motion.div>
  );
});

Welcome.displayName = 'Welcome';