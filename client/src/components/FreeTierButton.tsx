import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Network, Edit, Check } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelPresets } from '@/hooks/useModelPresets';
import { useModelSelection } from '@/hooks/useModelSelection';

interface FreeTierButtonProps {
  handleFreeTierClick: () => void; 
  isFreeTierDialogOpen: boolean;
  setIsFreeTierDialogOpen: (isOpen: boolean) => void;
  useLongPress: (callback: () => void, ms?: number) => any;
}

export const FreeTierButton = ({ 
  handleFreeTierClick, 
  isFreeTierDialogOpen, 
  setIsFreeTierDialogOpen,
  useLongPress
}: FreeTierButtonProps) => {
  const { 
    activeFreeTierModel,
    freeModels,
    activateFreeTierModel,
    formatModelName,
    isLoading,
    isPending
  } = useModelPresets();
  const { setSelectedModel, setCustomOpenRouterModelId } = useModelSelection();

  // Detect if Gemini Flash is available in free models
  const [geminiFlashExists, setGeminiFlashExists] = useState(false);
  const preferredGeminiModel = "google/gemini-2.0-flash-exp";

  // Check if preferred Gemini model exists among free models
  useEffect(() => {
    const geminiModel = freeModels.find(model => model.id === preferredGeminiModel);
    setGeminiFlashExists(!!geminiModel);
    
    // If no active free tier model is set and Gemini Flash exists, set it as default
    if (!activeFreeTierModel && geminiModel) {
      activateFreeTierModel(preferredGeminiModel);
      setSelectedModel('openrouter');
      setCustomOpenRouterModelId(preferredGeminiModel);
      console.log(`Free tier default model activated: ${preferredGeminiModel}`);
    }
  }, [freeModels, activeFreeTierModel]);

  const isActive = !!activeFreeTierModel;
  
  // Configure long press for mobile
  const longPressProps = useLongPress(() => {
    if (!isLoading && !isPending) {
      setIsFreeTierDialogOpen(true);
    }
  });
  
  return (
    <div className="relative group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleFreeTierClick}
              variant={isActive ? "default" : "outline"}
              className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 border-green-500 ${
                isActive ? 'bg-green-600 text-white' : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
              }`}
              {...longPressProps}
            >
              {activeFreeTierModel ? (
                <>
                  <Network size={16} className="mr-1" />
                  <span className="truncate max-w-[100px]">Free: {formatModelName(activeFreeTierModel)}</span>
                </>
              ) : (
                <>
                  <Network size={16} className="mr-1" />
                  <span>Free Tier</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Free Models</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Edit button (only on desktop) */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute -right-1 -top-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hidden sm:flex"
        onClick={(e) => {
          e.stopPropagation();  // Prevent triggering the button click
          setIsFreeTierDialogOpen(true);
        }}
      >
        <Edit size={12} />
      </Button>
    </div>
  );
};