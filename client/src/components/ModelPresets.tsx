import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Network } from 'lucide-react';

// Helper function to get the preset number from the key
const getPresetNumber = (key: string): string => {
  return key.replace('preset', '');
};

export const ModelPresets = () => {
  const { 
    presets, 
    isLoading, 
    isPending, 
    activePreset, 
    assignModelToPreset, 
    activatePreset,
    getModelNameById
  } = useModelPresets();
  
  const { models, selectedModelId, setSelectedModelId } = useOpenRouterModels();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4'>('preset1');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter models based on search term
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Handle right-click to open dialog for assigning model
  const handleContextMenu = (
    e: React.MouseEvent<HTMLButtonElement>, 
    presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4'
  ) => {
    e.preventDefault();
    setCurrentPresetKey(presetKey);
    setIsDialogOpen(true);
  };
  
  // Handle long press for mobile devices
  const handleLongPress = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4') => {
    setCurrentPresetKey(presetKey);
    setIsDialogOpen(true);
  };
  
  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4') => {
    const modelId = activatePreset(presetKey);
    if (modelId) {
      setSelectedModelId(modelId);
    }
  };
  
  // Save selected model to preset
  const saveModelToPreset = () => {
    if (selectedModelId) {
      assignModelToPreset(currentPresetKey, selectedModelId);
      setIsDialogOpen(false);
    }
  };
  
  // Render presets
  const renderPresets = () => {
    return Object.entries(presets).map(([key, modelId]) => {
      const isActive = activePreset === key;
      const presetKey = key as 'preset1' | 'preset2' | 'preset3' | 'preset4';
      
      return (
        <Button
          key={key}
          onClick={() => handleClick(presetKey)}
          onContextMenu={(e) => handleContextMenu(e, presetKey)}
          // Long press for mobile
          onTouchStart={() => {
            const timer = setTimeout(() => {
              handleLongPress(presetKey);
            }, 800);
            
            return () => clearTimeout(timer);
          }}
          variant={isActive ? "default" : "outline"}
          className={`flex items-center gap-1 py-2 px-4 text-sm transition-all duration-200 ${
            isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'
          }`}
          disabled={isLoading || isPending}
        >
          <Network size={16} className="mr-1" />
          {modelId ? (
            <span className="truncate max-w-[120px]">{getModelNameById(modelId)}</span>
          ) : (
            <span className="text-muted-foreground">Preset {getPresetNumber(key)}</span>
          )}
        </Button>
      );
    });
  };
  
  return (
    <>
      <div className="flex justify-center gap-2 mb-3">
        {renderPresets()}
      </div>
      
      {/* Model assignment dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Model to Preset {getPresetNumber(currentPresetKey)}</DialogTitle>
            <DialogDescription>
              Select a model from the list below to assign to this preset. Right-click (or long-press on mobile) 
              on a preset button anytime to change this assignment.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Input
              placeholder="Search models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            
            <Select
              value={selectedModelId || undefined}
              onValueChange={(value) => setSelectedModelId(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {filteredModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
                {filteredModels.length === 0 && (
                  <SelectItem value="none" disabled>
                    No models found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveModelToPreset} disabled={!selectedModelId || isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};