import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets';
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
import { Network, Edit, Check, Lock, Search, Image, Brain, Sparkles } from 'lucide-react';

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
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFreeTierDialogOpen, setIsFreeTierDialogOpen] = useState(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'>('preset1');
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for filtered models based on preset type
  const [filteredPresetModels, setFilteredPresetModels] = useState<any[]>([]);
  
  // Filter models based on search term and current preset type
  const filteredModels = (filteredPresetModels.length > 0 ? filteredPresetModels : models)
    .filter(model => 
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
    
    // Filter models based on preset type before opening dialog
    const presetFilteredModels = filterModelsForPreset(presetKey);
    setFilteredPresetModels(presetFilteredModels);
    
    setIsDialogOpen(true);
  };
  
  // Handle redirection to account balance page for locked models
  const handleLockedModelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate('/account-balance');
  };
  
  // Helper function to check if a model is multimodal
  const isMultimodalModel = (modelId: string): boolean => {
    // Check if model supports vision/images based on ID or name
    return (
      modelId.toLowerCase().includes('vision') || 
      modelId.toLowerCase().includes('image') ||
      modelId.toLowerCase().includes('multimodal') ||
      modelId.toLowerCase().includes('gemini') ||
      modelId.toLowerCase().includes('claude-3') ||
      modelId.toLowerCase().includes('gpt-4-vision') ||
      modelId.toLowerCase().includes('gpt-4o') ||
      modelId.toLowerCase().includes('llava')
    );
  };
  
  // Helper function to check if a model is a Perplexity search model
  const isPerplexityModel = (modelId: string): boolean => {
    return (
      modelId.toLowerCase().includes('perplexity') ||
      modelId.toLowerCase().includes('sonar')
    );
  };
  
  // Helper function to get preset-specific icon
  const getPresetIcon = (presetKey: string, modelId: string): React.ReactNode => {
    if (presetKey === 'preset2' || (presetKey === 'preset2' && !modelId)) {
      // For preset2 (reasoning models), use Brain icon
      return <Brain size={16} className="mr-1" />;
    } else if (presetKey === 'preset3' || (presetKey === 'preset3' && !modelId)) {
      // For preset3 (uncensored models), use Sparkles icon
      return <Sparkles size={16} className="mr-1" />;
    } else if (presetKey === 'preset4' || (presetKey === 'preset4' && !modelId)) {
      // For preset4 (multimodal models), use Image icon
      return <Image size={16} className="mr-1" />;
    } else if (presetKey === 'preset5' || (presetKey === 'preset5' && !modelId)) {
      // For preset5 (Perplexity/search models), use Search icon
      return <Search size={16} className="mr-1" />;
    } else {
      // For all other presets, use Network icon
      return <Network size={16} className="mr-1" />;
    }
  };
  
  // Helper function to check if a model is a reasoning model
  const isReasoningModel = (modelId: string): boolean => {
    return (
      modelId.toLowerCase().includes('reasoning') ||
      modelId.toLowerCase().includes('perplexity/sonar-reasoning') ||
      modelId.toLowerCase().includes('claude-reasoning')
    );
  };
  
  // Helper function to check if a model is an uncensored model
  const isUncensoredModel = (modelId: string): boolean => {
    return (
      modelId.toLowerCase().includes('grok') ||
      modelId.toLowerCase().includes('uncensored') ||
      modelId.toLowerCase().includes('instruct') ||
      modelId.toLowerCase().includes('x-ai') ||
      modelId.toLowerCase().includes('meta/llama') ||
      modelId.toLowerCase().includes('mistral')
    );
  };
  
  // Helper function to filter models for specific presets
  const filterModelsForPreset = (presetKey: string): any[] => {
    if (presetKey === 'preset2') {
      // Only allow reasoning models for preset2
      return models.filter(model => isReasoningModel(model.id));
    } else if (presetKey === 'preset3') {
      // Only allow uncensored models for preset3
      return models.filter(model => isUncensoredModel(model.id));
    } else if (presetKey === 'preset4') {
      // Only allow multimodal models for preset4
      return models.filter(model => isMultimodalModel(model.id));
    } else if (presetKey === 'preset5') {
      // Only allow Perplexity models for preset5
      return models.filter(model => isPerplexityModel(model.id));
    } else {
      // Return all models for other presets
      return models;
    }
  };
  
  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5') => {
    const modelId = activatePreset(presetKey);
    
    if (modelId) {
      setSelectedModelId(modelId);
      
      // Set model type based on preset and capabilities
      if (presetKey === 'preset2') {
        // Preset 2 is for reasoning models
        setSelectedModel('reasoning');
      } else if (presetKey === 'preset3') {
        // Preset 3 is for uncensored models
        setSelectedModel('openrouter'); // Using standard OpenRouter for uncensored models
      } else if (presetKey === 'preset4') {
        // Preset 4 is always for multimodal models
        setSelectedModel('multimodal');
      } else if (presetKey === 'preset5') {
        // Preset 5 is for search/Perplexity models
        setSelectedModel('search');
      } else {
        // For other presets, determine type based on the model's capabilities
        const shouldSetMultimodal = isMultimodalModel(modelId);
        setSelectedModel(shouldSetMultimodal ? 'multimodal' : 'openrouter');
      }
      
      // Set the custom OpenRouter model ID
      setCustomOpenRouterModelId(modelId);
    } else {
      // If no model is assigned to this preset yet, set default types based on preset
      if (presetKey === 'preset2') {
        setSelectedModel('reasoning');
      } else if (presetKey === 'preset3') {
        setSelectedModel('openrouter');
      } else if (presetKey === 'preset4') {
        setSelectedModel('multimodal');
      } else if (presetKey === 'preset5') {
        setSelectedModel('search');
      }
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
      // Reset filtered models list
      setFilteredPresetModels([]);
      setSearchTerm('');
    }
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
            {getPresetIcon(presetKey, modelId || '')}
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
      <Dialog 
        open={isDialogOpen} 
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          // Reset filtered models when dialog closes
          if (!open) {
            setFilteredPresetModels([]);
            setSearchTerm('');
          }
        }}
      >
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