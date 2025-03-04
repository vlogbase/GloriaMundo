import { useState, FormEvent, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Send, Lightbulb, Search, Image } from "lucide-react";
import { useModelSelection } from "@/hooks/useModelSelection";
import { ModelType } from "@/lib/types";
import { MODEL_OPTIONS } from "@/lib/models";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export const ChatInput = ({ onSendMessage, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedModel, setSelectedModel } = useModelSelection();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || isLoading) return;
    
    onSendMessage(message);
    setMessage("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const adjustHeight = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    
    textarea.addEventListener("input", adjustHeight);
    return () => textarea.removeEventListener("input", adjustHeight);
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Get model icon based on id
  const getModelIcon = (id: ModelType) => {
    switch(id) {
      case "reasoning":
        return <Lightbulb size={18} />;
      case "search":
        return <Search size={18} />;
      case "multimodal":
        return <Image size={18} />;
      default:
        return <Lightbulb size={18} />;
    }
  };

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-4xl mx-auto">
        <TooltipProvider>
          <ToggleGroup 
            type="single" 
            value={selectedModel}
            onValueChange={(value) => value && setSelectedModel(value as ModelType)}
            className="flex justify-center mb-3 space-x-1 select-none"
          >
            {Object.values(MODEL_OPTIONS).map((model) => (
              <Tooltip key={model.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem 
                    value={model.id} 
                    aria-label={model.name}
                    className={`flex items-center gap-1 px-3 py-1 text-sm 
                    ${selectedModel === model.id ? 'bg-primary/20 border-primary/50 ring-1 ring-primary/30 font-medium' : 'hover:bg-primary/10'}
                    transition-all duration-200`}
                  >
                    {getModelIcon(model.id)}
                    <span>{model.name}</span>
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>{model.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </TooltipProvider>
        
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message GloriaMundo..."
            className="w-full p-3 pr-12 min-h-[44px] max-h-[200px] resize-none border-border rounded-lg focus:ring-2 focus:ring-primary/50"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="absolute right-3 bottom-3 text-primary hover:text-primary/80 transition-colors"
            disabled={isLoading || !message.trim()}
          >
            <Send size={18} />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          For important decisions, always confirm information with trusted sources.
        </p>
      </div>
    </div>
  );
};
