import { Sparkles, ChevronRight, ImageIcon, SearchIcon, BrainCircuit } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  // Reasoning & Multimodal shared prompts
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
  
  // Multimodal-specific prompts (with image capabilities)
  {
    shortQuestion: "Analyze this image",
    fullQuestion: "I'll upload an image. Please analyze it in detail - describe what you see, any notable features, and what might be happening in the image.",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Identify objects",
    fullQuestion: "I'll upload a photo. Could you identify all the main objects present in the image and describe their spatial relationships?",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Read text from image",
    fullQuestion: "I'll share an image containing text. Please read and transcribe all the text visible in the image.",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Explain this diagram",
    fullQuestion: "I'm going to share a diagram or chart. Could you explain what information it's conveying and interpret any data or processes shown?",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "What's wrong with this code?",
    fullQuestion: "I'll share a screenshot of code that isn't working. Could you identify any bugs or issues and suggest how to fix them?",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Solve this math problem",
    fullQuestion: "I'll upload a photo of a handwritten math problem. Could you solve it step by step and explain your solution?",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Identify this location",
    fullQuestion: "I'll share a photo of a place. Based on the visual elements, could you suggest where this might be located and what makes it distinctive?",
    modelTypes: ["multimodal"]
  },
  {
    shortQuestion: "Assess this design",
    fullQuestion: "I'll upload a design mockup or product image. Could you provide a critique focusing on aesthetics, functionality, and potential improvements?",
    modelTypes: ["multimodal"]
  },
  
  // Search model prompts
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
  fullSuggestion,
  isExpanded,
  isLoading, 
  onClick,
  onExpand,
  modelType
}: { 
  suggestion: string;
  fullSuggestion: string;
  isExpanded: boolean;
  isLoading: boolean;
  onClick: () => void;
  onExpand: () => void;
  modelType: ModelType;
}) => {
  const getModelIcon = () => {
    if (modelType === "search") {
      return <SearchIcon size={14} />;
    } else if (modelType === "multimodal") {
      return <ImageIcon size={14} />;
    } else {
      return <BrainCircuit size={14} />;
    }
  };

  return (
    <div className="flex flex-col w-full">
      <motion.button
        className={`px-4 py-3 rounded-t-2xl ${isExpanded ? '' : 'rounded-b-2xl'} bg-primary/10 hover:bg-primary/20 transition-all
                  text-sm md:text-base cursor-pointer shadow-sm
          ${isExpanded ? "bg-primary/20 text-primary font-medium" : ""}
          ${isLoading ? "opacity-50 cursor-not-allowed" : ""}
        `}
        disabled={isLoading}
        onClick={onExpand}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-primary/70">{getModelIcon()}</span>
            <span>{suggestion}</span>
          </div>
          
          <ChevronRight 
            size={16} 
            className={`text-primary transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} 
          />
        </div>
      </motion.button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div 
              className="p-4 text-sm bg-primary/5 border-t border-primary/10 rounded-b-2xl"
            >
              <p className="mb-3">{fullSuggestion}</p>
              <button
                onClick={onClick}
                disabled={isLoading}
                className="flex items-center gap-1 text-primary hover:underline text-sm font-medium"
              >
                <Sparkles size={14} />
                <span>Ask this question</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

SuggestionBubble.displayName = 'SuggestionBubble';

// The main Welcome component
export const Welcome = memo(({ onSuggestionClick, isLoading = false }: WelcomeProps) => {
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<number | null>(null);
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
      // Reset expanded state when suggestions change
      setExpandedSuggestionId(null);
    };
    
    getRandomSuggestionsForModel();
  }, [selectedModel]);
  
  const handleSuggestionExpand = (index: number) => {
    setExpandedSuggestionId(prev => prev === index ? null : index);
  };
  
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
      <div className="flex flex-col gap-3 sm:gap-4 max-w-2xl w-full">
        {displayedSuggestions.map((suggestion, index) => {
          const isThisExpanded = expandedSuggestionId === index;
          const isThisClicked = clickedSuggestionId === index;
          
          return (
            <SuggestionBubble
              key={index}
              suggestion={suggestion.shortQuestion}
              fullSuggestion={suggestion.fullQuestion}
              isExpanded={isThisExpanded}
              isLoading={isLoading || isThisClicked}
              onClick={() => handleSuggestionClick(index, suggestion)}
              onExpand={() => handleSuggestionExpand(index)}
              modelType={suggestion.modelTypes[0]} // Use the first model type as the primary type
            />
          );
        })}
      </div>
    </motion.div>
  );
});

Welcome.displayName = 'Welcome';