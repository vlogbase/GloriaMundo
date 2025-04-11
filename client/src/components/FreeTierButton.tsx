import React from 'react';
import { Check, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useLongPress } from '@/hooks/useLongPress';

interface FreeTierButtonProps {
  modelId: string | null;
  isActive: boolean;
  isLoading: boolean;
  isPending: boolean;
  getPresetIcon: (key: string, modelId: string) => React.ReactNode;
  getPresetTitle: (key: string, modelId: string | null) => string;
  handleClick: (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => void;
  handleEditClick: (e: React.MouseEvent) => void;
}

const FreeTierButton: React.FC<FreeTierButtonProps> = ({
  modelId,
  isActive,
  isLoading,
  isPending,
  getPresetIcon,
  getPresetTitle,
  handleClick,
  handleEditClick
}) => {
  // Configure long press for mobile (for free tier)
  const longPressProps = useLongPress(() => {
    if (!isLoading && !isPending) {
      handleEditClick({ stopPropagation: () => {} } as React.MouseEvent);
    }
  });
  
  return (
    <div className="relative group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => handleClick('preset6')}
              variant={isActive ? "default" : "outline"}
              className={`relative flex flex-row items-center ${isActive ? 'shadow-md' : ''}`}
              disabled={isLoading || isPending}
              {...longPressProps}
            >
              {getPresetIcon('preset6', modelId || '')}
              {getPresetTitle('preset6', modelId)}
              {isActive && <Check size={12} className="ml-1" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Free Tier</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Edit button (desktop only) - opens free model selection dialog */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute -right-1 -top-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hidden sm:flex"
        onClick={handleEditClick}
      >
        <Edit size={12} />
      </Button>
    </div>
  );
};

export default FreeTierButton;