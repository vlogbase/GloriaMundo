import React from 'react';
import { Check, Edit, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useLongPress } from '@/hooks/useLongPress';

interface PresetButtonProps {
  presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6';
  modelId: string | null;
  isActive: boolean;
  hasCredits: boolean;
  isLoading: boolean;
  isPending: boolean;
  getPresetIcon: (key: string, modelId: string) => React.ReactNode;
  getPresetTitle: (key: string, modelId: string | null) => string;
  getPresetCategory: (key: string) => string;
  handleClick: (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => void;
  handleEditClick: (e: React.MouseEvent, presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => void;
  handleLockedModelClick: () => void;
  onLongPress?: () => void;
}

const PresetButton: React.FC<PresetButtonProps> = ({
  presetKey,
  modelId,
  isActive,
  hasCredits,
  isLoading,
  isPending,
  getPresetIcon,
  getPresetTitle,
  getPresetCategory,
  handleClick,
  handleEditClick,
  handleLockedModelClick,
  onLongPress
}) => {
  // Determine if this model requires credits
  const isLocked = !!modelId && !hasCredits && presetKey !== 'preset6' && !modelId.includes(':free');
  
  // Configure long press for mobile
  const longPressProps = useLongPress(() => {
    if (onLongPress) onLongPress();
  });
  
  return (
    <div className="relative group">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => isLocked ? handleLockedModelClick() : handleClick(presetKey)}
              variant={isActive ? "default" : "outline"}
              className={`relative flex flex-row items-center ${isActive ? 'shadow-md' : ''} ${isLocked ? 'opacity-90' : ''}`}
              disabled={isLoading || isPending}
              {...longPressProps}
            >
              {getPresetIcon(presetKey, modelId || '')}
              {getPresetTitle(presetKey, modelId)}
              {isActive && <Check size={12} className="ml-1" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getPresetCategory(presetKey)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      {/* Padlock overlay for locked models */}
      {isLocked && (
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px] rounded flex items-center justify-center cursor-pointer"
          onClick={handleLockedModelClick}
          title="You need funds to use this model. Click to add funds."
        >
          <Lock className="w-4 h-4 text-white/90" />
        </div>
      )}
      
      {/* Edit button (desktop only) */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute -right-1 -top-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hidden sm:flex"
        onClick={(e) => handleEditClick(e, presetKey)}
      >
        <Edit size={12} />
      </Button>
    </div>
  );
};

export default PresetButton;