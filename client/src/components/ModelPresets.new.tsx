import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets.fixed';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { useModelSelection } from '@/hooks/useModelSelection';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Network, Edit, Check } from 'lucide-react';

// Helper function to get the preset number from the key
const getPresetNumber = (key: string): string => {
  return key.replace('preset', '');
};

// Helper function to group models by provider
const groupModelsByProvider = (models: any[]) => {
  const grouped: Record<string, any[]> = {};
  
  models.forEach(model => {
    const parts = model.id.split('/');
    const provider = parts.length > 1 ? parts[0] : 'Other';
    
    if (!grouped[provider]) {
      grouped[provider] = [];
    }
    
    grouped[provider].push(model);
  });
  
  return grouped;
};

export const ModelPresets = () => {
  const { 
    presets, 
    isLoading, 
    isPending, 
    activePreset,
    activeFreeTierModel,
    freeModels,
    assignModelToPreset, 
    activatePreset,
    activateFreeTierModel,
    getModelNameById,
    formatModelName
  } = useModelPresets();
  
  const { models, selectedModelId, setSelectedModelId } = useOpenRouterModels();
  const { setSelectedModel } = useModelSelection();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFreeTierDialogOpen, setIsFreeTierDialogOpen] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'>('preset1');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter models based on search term
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Group models by provider for the preset selection dialog
  const groupedModels = groupModelsByProvider(filteredModels);
  
  // Handle edit button click to open dialog for assigning model
  const handleEditClick = (
    e: React.MouseEvent<HTMLButtonElement>, 
    presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'
  ) => {
    e.stopPropagation(); // Prevent triggering the preset button click
    setCurrentPresetKey(presetKey);
    setSelectedModelId(presets[presetKey] || '');
    setIsDialogOpen(true);
  };
  
  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5') => {
    const modelId = activatePreset(presetKey);
    if (modelId) {
      setSelectedModelId(modelId);
      // Always set the model type to 'openrouter' when a preset is activated
      setSelectedModel('openrouter');
    }
  };
  
  // Handle free tier button click
  const handleFreeTierClick = () => {
    // If no free tier model is active, open the selection dialog
    if (!activeFreeTierModel) {
      setIsFreeTierDialogOpen(true);
    } else {
      // If a free tier model is already active, activate it again
      setSelectedModelId(activeFreeTierModel);
      setSelectedModel('openrouter');
    }
  };
  
  // Handle selecting a free model
  const handleSelectFreeModel = (modelId: string) => {
    activateFreeTierModel(modelId);
    setSelectedModelId(modelId);
    setSelectedModel('openrouter');
    setIsFreeTierDialogOpen(false);
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
      const presetKey = key as 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5';
      
      return (
        <div key={key} className="relative group">
          <Button
            onClick={() => handleClick(presetKey)}
            variant={isActive ? "default" : "outline"}
            className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 ${
              isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'
            }`}
            disabled={isLoading || isPending}
          >
            <Network size={16} className="mr-1" />
            {modelId ? (
              <span className="truncate max-w-[100px]">{formatModelName(modelId)}</span>
            ) : (
              <span className="text-muted-foreground">Preset {getPresetNumber(key)}</span>
            )}
          </Button>
          
          {/* Edit button */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute -right-1 -top-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => handleEditClick(e, presetKey)}
          >
            <Edit size={12} />
          </Button>
        </div>
      );
    });
  };
  
  // Render free tier button
  const renderFreeTierButton = () => {
    return (
      <Button
        onClick={handleFreeTierClick}
        variant={activeFreeTierModel ? "default" : "outline"}
        className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 border-green-500 ${
          activeFreeTierModel ? 'bg-green-600 text-white' : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
        }`}
      >
        {activeFreeTierModel ? (
          <>
            <Check size={16} className="mr-1" />
            <span className="truncate max-w-[100px]">Free: {formatModelName(activeFreeTierModel)}</span>
          </>
        ) : (
          <>
            <Network size={16} className="mr-1" />
            <span>Free Tier</span>
          </>
        )}
      </Button>
    );
  };
  
  return (
    <>
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        {renderPresets()}
        {renderFreeTierButton()}
      </div>
      
      {/* Model assignment dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Model to Preset {getPresetNumber(currentPresetKey)}</DialogTitle>
            <DialogDescription>
              Select a model from the list below to assign to this preset. Click the edit icon on a preset button anytime to change this assignment.
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
                {Object.entries(groupedModels).map(([provider, providerModels]) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>{provider}</SelectLabel>
                    {providerModels.map((model) => (
                      <SelectItem key={model.id} value={model.id} className="flex justify-between">
                        <div className="flex flex-col">
                          <span>{model.name}</span>
                          <span className="text-xs text-muted-foreground">{model.id}</span>
                          {model.context_length && (
                            <span className="text-xs text-muted-foreground">
                              Context: {Math.round(model.context_length / 1000)}k tokens
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {Object.keys(groupedModels).length === 0 && (
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
      
      {/* Free tier model selection dialog */}
      <Dialog open={isFreeTierDialogOpen} onOpenChange={setIsFreeTierDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a Free Model</DialogTitle>
            <DialogDescription>
              These models are available at no cost. Choose one to use for your conversation.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Input
              placeholder="Search free models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            
            <div className="space-y-4">
              {freeModels.length > 0 ? (
                Object.entries(groupModelsByProvider(freeModels.filter(model => 
                  model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  model.id.toLowerCase().includes(searchTerm.toLowerCase())
                ))).map(([provider, providerModels]) => (
                  <div key={provider} className="space-y-2">
                    <h3 className="text-sm font-medium">{provider}</h3>
                    <div className="space-y-1">
                      {providerModels.map(model => (
                        <Button
                          key={model.id}
                          variant="outline"
                          className="w-full justify-start text-left h-auto py-2"
                          onClick={() => handleSelectFreeModel(model.id)}
                        >
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">{model.id}</span>
                            {model.context_length && (
                              <span className="text-xs text-muted-foreground">
                                Context: {Math.round(model.context_length / 1000)}k tokens
                              </span>
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">No free models found</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFreeTierDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};