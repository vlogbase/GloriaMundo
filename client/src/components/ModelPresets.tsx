import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets.fixed';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { useModelSelection } from '@/hooks/useModelSelection';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
import { Network, Edit, Check, Lock } from 'lucide-react';

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
  
  const { models } = useOpenRouterModels();
  const { setSelectedModel, setCustomOpenRouterModelId } = useModelSelection();
  const [, navigate] = useLocation();
  
  // Query for user's credit balance
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return null;
          }
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    }
  });
  
  // Check if user has credits (positive balance)
  const hasCredits = user?.creditBalance > 0;
  
  // Separate state management for dialogs
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFreeTierDialogOpen, setIsFreeTierDialogOpen] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'>('preset1');
  
  // Separate search terms for each dialog
  const [presetSearchTerm, setPresetSearchTerm] = useState('');
  const [freeTierSearchTerm, setFreeTierSearchTerm] = useState('');
  
  // Separate selectedModelId state for dialogs
  const [dialogSelectedModelId, setDialogSelectedModelId] = useState<string | null>(null);
  
  // Filter models based on preset search term
  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(presetSearchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(presetSearchTerm.toLowerCase())
  );
  
  // Filter free models based on free tier search term
  const filteredFreeModels = freeModels.filter(model => 
    model.name.toLowerCase().includes(freeTierSearchTerm.toLowerCase()) ||
    model.id.toLowerCase().includes(freeTierSearchTerm.toLowerCase())
  );
  
  // Group models by provider for the preset selection dialog
  const groupedModels = groupModelsByProvider(filteredModels);
  const groupedFreeModels = groupModelsByProvider(filteredFreeModels);
  
  // Handle edit button click to open dialog for assigning model
  const handleEditClick = (
    e: React.MouseEvent<HTMLButtonElement>, 
    presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'
  ) => {
    e.stopPropagation(); // Prevent triggering the preset button click
    setCurrentPresetKey(presetKey);
    setDialogSelectedModelId(presets[presetKey] || null);
    setPresetSearchTerm(''); // Clear search when opening dialog
    setIsDialogOpen(true);
  };
  
  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5') => {
    // Get the model ID associated with this preset
    const modelId = activatePreset(presetKey);
    
    console.log(`Attempting to activate preset ${presetKey}...`);
    console.log(`Preset contains model ID: ${modelId}`);
    
    // If a valid model ID was returned from the preset
    if (modelId) {
      // Important: We must set the selected model type to 'openrouter' first
      // so the chat component knows to use the custom model ID
      console.log(`Setting selected model to 'openrouter'`);
      setSelectedModel('openrouter');
      
      // Now set the specific model ID to use with OpenRouter
      console.log(`Setting custom OpenRouter model ID to: ${modelId}`);
      setCustomOpenRouterModelId(modelId);
      
      console.log(`Activated preset ${presetKey} with model: ${modelId}`);
    } else {
      console.warn(`Preset ${presetKey} has no model assigned.`);
      // Optionally show a toast notification here
    }
  };
  
  // Handle free tier button click
  const handleFreeTierClick = () => {
    // If no free tier model is active, open the selection dialog
    if (!activeFreeTierModel) {
      console.log('No active free tier model, opening selection dialog');
      setFreeTierSearchTerm(''); // Clear search when opening dialog
      setIsFreeTierDialogOpen(true);
    } else {
      // If a free tier model is already active, use it again
      console.log(`Re-using active free tier model: ${activeFreeTierModel}`);
      
      // Same order as preset selection - first set model type to openrouter
      console.log(`Setting selected model to 'openrouter'`);
      setSelectedModel('openrouter');
      
      // Then set the specific model ID
      console.log(`Setting custom OpenRouter model ID to: ${activeFreeTierModel}`);
      setCustomOpenRouterModelId(activeFreeTierModel);
      
      console.log(`Activated free tier model: ${activeFreeTierModel}`);
    }
  };
  
  // Handle selecting a free model
  const handleSelectFreeModel = (modelId: string) => {
    console.log(`User selected free model: ${modelId}`);
    
    // Update the active free tier model in our context
    activateFreeTierModel(modelId);
    
    // Same order as preset selection - first set model type to openrouter
    console.log(`Setting selected model to 'openrouter'`);
    setSelectedModel('openrouter');
    
    // Then set the specific model ID
    console.log(`Setting custom OpenRouter model ID to: ${modelId}`);
    setCustomOpenRouterModelId(modelId);
    
    console.log(`Selected free tier model: ${modelId}`);
    setIsFreeTierDialogOpen(false);
  };
  
  // Save selected model to preset
  const saveModelToPreset = () => {
    if (dialogSelectedModelId) {
      console.log(`Saving model ${dialogSelectedModelId} to preset ${currentPresetKey}`);
      
      // This will call the mutate function in useModelPresets which formats the data for the API
      assignModelToPreset(currentPresetKey, dialogSelectedModelId);
      
      console.log('Closing dialog after saving preset');
      setIsDialogOpen(false);
    } else {
      console.warn('No model selected for preset');
    }
  };
  
  // Handle redirection to account balance page for locked models
  const handleLockedModelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('/account-balance');
  };
  
  // Render presets
  const renderPresets = () => {
    return Object.entries(presets).map(([key, modelId]) => {
      const isActive = activePreset === key;
      const presetKey = key as 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5';
      
      // Check if this preset model is a free model
      const isFreeTier = modelId ? freeModels.some(model => model.id === modelId) : false;
      
      // Determine if this model should be locked (non-free model and no credits)
      const isLocked = !isFreeTier && !hasCredits && modelId;
      
      return (
        <div key={key} className="relative group">
          <Button
            onClick={isLocked ? handleLockedModelClick : () => handleClick(presetKey)}
            variant={isActive ? "default" : "outline"}
            className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 ${
              isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'
            } ${isLocked ? 'cursor-pointer' : ''}`}
            disabled={isLoading || isPending}
          >
            <Network size={16} className="mr-1" />
            {modelId ? (
              <span className="truncate max-w-[100px]">{formatModelName(modelId)}</span>
            ) : (
              <span className="text-muted-foreground">Preset {getPresetNumber(key)}</span>
            )}
          </Button>
          
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
          
          {/* Edit button */}
          <Button
            size="icon"
            variant="ghost"
            className="absolute -right-1 -top-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
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
              value={presetSearchTerm}
              onChange={(e) => setPresetSearchTerm(e.target.value)}
              className="mb-4"
            />
            
            <Select
              value={dialogSelectedModelId || undefined}
              onValueChange={(value) => setDialogSelectedModelId(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupedModels).map(([provider, providerModels]) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>{provider}</SelectLabel>
                    {providerModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
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
            <Button onClick={saveModelToPreset} disabled={!dialogSelectedModelId || isPending}>
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
              value={freeTierSearchTerm}
              onChange={(e) => setFreeTierSearchTerm(e.target.value)}
              className="mb-4"
            />
            
            <div className="space-y-4">
              {freeModels.length > 0 ? (
                Object.entries(groupedFreeModels).map(([provider, providerModels]) => (
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
              {filteredFreeModels.length === 0 && freeModels.length > 0 && (
                <p className="text-center text-muted-foreground">No free models match your search</p>
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