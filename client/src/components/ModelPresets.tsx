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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    formatModelName,
    initializeFreeTierPreset
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
  const hasCredits = user && user.creditBalance && user.creditBalance > 0;
  
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isFreeTierDialogOpen, setIsFreeTierDialogOpen] = useState<boolean>(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6'>('preset1');
  const [filteredPresetModels, setFilteredPresetModels] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  
  // Initialize the free tier preset when models are available
  useEffect(() => {
    if (freeModels.length > 0) {
      initializeFreeTierPreset();
    }
  }, [freeModels]);
  
  // Helper function to check if a model is a multimodal model (supports images)
  const isMultimodalModel = (modelId: string): boolean => {
    const multimodalModels = [
      'openai/gpt-4o',
      'openai/gpt-4-vision',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3-haiku',
      'x-ai/grok-2',
      'google/gemini',
      'google/gemini-pro',
      'google/gemini-1.5-pro',
      'google/gemini-2.0-pro',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-pro-exp-03-25',
      'mistral/mercury-beta'
    ];
    
    return multimodalModels.some(model => 
      modelId.toLowerCase() === model.toLowerCase() || 
      modelId.toLowerCase().includes(model.toLowerCase().replace(/\s+/g, '-'))
    );
  };
  
  // Helper function to check if a model is a Perplexity model
  const isPerplexityModel = (modelId: string): boolean => {
    return modelId.toLowerCase().includes('perplexity');
  };
  
  // Update filtered models when filters change
  useEffect(() => {
    // Get the models appropriate for this preset
    let presetModels = filterModelsForPreset(currentPresetKey);
    
    // Filter by search term if one is provided
    if (searchTerm) {
      presetModels = presetModels.filter(model => 
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Filter by provider if one is selected
    if (selectedProvider) {
      presetModels = presetModels.filter(model => {
        const parts = model.id.split('/');
        const provider = parts.length > 1 ? parts[0] : 'Other';
        return provider === selectedProvider;
      });
    }
    
    setFilteredPresetModels(presetModels);
  }, [searchTerm, selectedProvider, currentPresetKey, models]);
  
  // Handler for showing the edit dialog
  const handleEditClick = (e: React.MouseEvent, presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => {
    e.stopPropagation(); // Prevent button click from triggering the parent
    
    // Skip the dialog for preset6 (FREE) since it's automatically managed
    if (presetKey === 'preset6') {
      return;
    }
    
    setCurrentPresetKey(presetKey);
    setFilteredPresetModels(filterModelsForPreset(presetKey));
    setIsDialogOpen(true);
    setSearchTerm('');
    setSelectedProvider(null);
  };
  
  // Handler for clicking a locked model
  const handleLockedModelClick = () => {
    // Navigate to credits page
    navigate('/credits');
  };
  
  // Helper function to get preset title with model name
  const getPresetTitle = (presetKey: string, modelId: string | null): string => {
    const presetNumber = getPresetNumber(presetKey);
    
    // Special case for preset6 (FREE)
    if (presetKey === 'preset6') {
      if (modelId) {
        // Show "FREE: ModelName" format
        let modelName = formatModelName(modelId);
        // Truncate if too long for display
        if (modelName.length > 10) {
          modelName = modelName.substring(0, 10) + '...';
        }
        return `FREE: ${modelName}`;
      }
      return 'FREE';
    }
    
    // For other presets
    if (modelId) {
      let modelName = formatModelName(modelId);
      // Keep preset number in title
      return `${presetNumber}: ${modelName}`;
    } else {
      return `${presetNumber}: Select`;
    }
  };
  
  // Helper function to get preset category
  const getPresetCategory = (presetKey: string): string => {
    switch (presetKey) {
      case 'preset1':
        return 'General Purpose';
      case 'preset2':
        return 'All Models';
      case 'preset3':
        return 'Reasoning';
      case 'preset4':
        return 'Multimodal';
      case 'preset5':
        return 'Search';
      case 'preset6':
        return 'Free Tier';
      default:
        return 'Model Preset';
    }
  };
  
  // Helper function to get preset-specific icon
  const getPresetIcon = (presetKey: string, modelId: string): React.ReactNode => {
    if (presetKey === 'preset3' || (presetKey === 'preset3' && !modelId)) {
      // For preset3 (reasoning models), use Brain icon
      return <Brain size={16} className="mr-1" />;
    } else if (presetKey === 'preset4' || (presetKey === 'preset4' && !modelId)) {
      // For preset4 (multimodal models), use Image icon
      return <Image size={16} className="mr-1" />;
    } else if (presetKey === 'preset5' || (presetKey === 'preset5' && !modelId)) {
      // For preset5 (Perplexity/search models), use Search icon
      return <Search size={16} className="mr-1" />;
    } else if (presetKey === 'preset6' || (presetKey === 'preset6' && !modelId)) {
      // For preset6 (FREE models), use Sparkles icon
      return <Sparkles size={16} className="mr-1" />;
    } else {
      // For other presets (preset1, preset2) - All Models, use Network icon
      return <Network size={16} className="mr-1" />;
    }
  };
  
  // Helper function to check if a model is a reasoning model from the provided list
  const isReasoningModel = (modelId: string): boolean => {
    const reasoningModels = [
      'openai/o1',
      'openai/o1-pro',
      'openai/o1-preview',
      'openai/o1-mini',
      'openai/o1-mini (2024-09-12)',
      'openai/o3-mini',
      'openai/o3-mini-high',
      'perplexity/r1-1776',
      'anthropic/claude-3.7-sonnet-thinking',
      'deepseek/r1-zero',
      'deepseek/r1',
      'qwen/qwq-32b',
      'google/gemini-2.0-flash-thinking',
      'google/gemini-2.5-pro-preview-03-25'
    ];
    
    return reasoningModels.some(model => 
      modelId.toLowerCase() === model.toLowerCase() || 
      modelId.toLowerCase().includes(model.toLowerCase().replace(/\s+/g, '-'))
    );
  };
  
  // Helper function to filter models for specific presets
  const filterModelsForPreset = (presetKey: string): any[] => {
    if (presetKey === 'preset3') {
      // Only allow reasoning models for preset3
      return models.filter(model => isReasoningModel(model.id));
    } else if (presetKey === 'preset4') {
      // Only allow multimodal models for preset4
      return models.filter(model => isMultimodalModel(model.id));
    } else if (presetKey === 'preset5') {
      // Only allow Perplexity models for preset5
      return models.filter(model => isPerplexityModel(model.id));
    } else if (presetKey === 'preset6') {
      // Only allow free models for preset6
      return models.filter(model => model.isFree === true);
    } else {
      // Return all models for preset1 and preset2
      return models;
    }
  };
  
  // Helper function to consistently set model type and ID
  const handleActivation = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6', modelId: string | null) => {
    if (modelId) {
      // Set the selected model ID
      setSelectedModelId(modelId);
      
      // Set model type based on preset and capabilities
      if (presetKey === 'preset3') {
        // Preset 3 is for reasoning models
        setSelectedModel('reasoning');
      } else if (presetKey === 'preset4') {
        // Preset 4 is always for multimodal models
        setSelectedModel('multimodal');
      } else if (presetKey === 'preset5') {
        // Preset 5 is for search/Perplexity models
        setSelectedModel('search');
      } else if (presetKey === 'preset6') {
        // Preset 6 (FREE) - determine type based on the model's capabilities
        const shouldSetMultimodal = isMultimodalModel(modelId);
        setSelectedModel(shouldSetMultimodal ? 'multimodal' : 'openrouter');
      } else {
        // For presets 1 and 2 (all models), determine type based on the model's capabilities
        const shouldSetMultimodal = isMultimodalModel(modelId);
        setSelectedModel(shouldSetMultimodal ? 'multimodal' : 'openrouter');
      }
      
      // Set the custom OpenRouter model ID (important for the actual API call)
      setCustomOpenRouterModelId(modelId);
      
      // Log for debugging purposes
      console.log(`Model activated: ${modelId}, Type: ${presetKey === 'preset3' ? 'reasoning' : 
                                                   presetKey === 'preset4' ? 'multimodal' :
                                                   presetKey === 'preset5' ? 'search' :
                                                   isMultimodalModel(modelId) ? 'multimodal' : 'openrouter'}`);
    } else {
      // If no model is assigned to this preset yet, set default types based on preset
      if (presetKey === 'preset3') {
        setSelectedModel('reasoning');
      } else if (presetKey === 'preset4') {
        setSelectedModel('multimodal');
      } else if (presetKey === 'preset5') {
        setSelectedModel('search');
      } else {
        // Default for preset1, preset2, and preset6
        setSelectedModel('openrouter');
      }
    }
  };

  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => {
    const modelId = activatePreset(presetKey);
    handleActivation(presetKey, modelId);
  };
  
  // Handle free tier button click - this is now the same as clicking preset6
  const handleFreeTierClick = () => {
    // Activate preset6 (FREE tier)
    handleClick('preset6');
  };
  
  // Handle selecting a free model
  const handleSelectFreeModel = (modelId: string) => {
    // Assign this model to preset6
    assignModelToPreset('preset6', modelId);
    
    // Activate preset6 with this model
    handleActivation('preset6', modelId);
    
    // Close the dialog
    setIsFreeTierDialogOpen(false);
  };
  
  // Save selected model to preset and activate it immediately
  const saveModelToPreset = () => {
    if (selectedModelId) {
      // Assign the model to the preset
      assignModelToPreset(currentPresetKey, selectedModelId);
      
      // Now immediately activate this preset
      handleActivation(currentPresetKey, selectedModelId);
      
      // Close the dialog and reset filters
      setIsDialogOpen(false);
      setFilteredPresetModels([]);
      setSearchTerm('');
    }
  };
  
  // Long press handler for mobile
  const useLongPress = (callback: () => void, ms = 500) => {
    const [startLongPress, setStartLongPress] = useState(false);
    
    useEffect(() => {
      let timerId: NodeJS.Timeout;
      if (startLongPress) {
        timerId = setTimeout(callback, ms);
      }
      
      return () => {
        clearTimeout(timerId);
      };
    }, [callback, ms, startLongPress]);
    
    return {
      onMouseDown: () => setStartLongPress(true),
      onMouseUp: () => setStartLongPress(false),
      onMouseLeave: () => setStartLongPress(false),
      onTouchStart: () => setStartLongPress(true),
      onTouchEnd: () => setStartLongPress(false),
    };
  };
  
  // Render preset buttons (1-5)
  const renderPresetButtons = () => {
    // Ensure presets is an object, use an empty object as fallback
    const presetEntries = presets && typeof presets === 'object' 
      ? Object.entries(presets).filter(([key]) => key !== 'preset6') // Filter out preset6, it's handled separately
      : [];
    
    // Add defensive check for map operation
    if (!Array.isArray(presetEntries)) {
      console.error('presetEntries is not an array:', presetEntries);
      return null;
    }
    
    return presetEntries.map(([key, modelId]) => {
      // Cast key to expected type
      const presetKey = key as 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5';
      const isActive = activePreset === presetKey;
      
      // Determine if this model requires credits
      const isLocked = !!modelId && !hasCredits && key !== 'preset6' && !modelId.includes(':free');
      
      // Configure long press for mobile
      const longPressProps = useLongPress(() => {
        // Skip edit for preset6 (FREE tier)
        if (key !== 'preset6' && !isLoading && !isPending) {
          setCurrentPresetKey(presetKey);
          setFilteredPresetModels(filterModelsForPreset(presetKey));
          setIsDialogOpen(true);
          setSearchTerm('');
          setSelectedProvider(null);
        }
      });
      
      return (
        <div key={key} className="relative group">
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
                  {getPresetIcon(key, modelId || '')}
                  {getPresetTitle(key, modelId)}
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
    });
  };
  
  // Render FREE tier button (preset6)
  const renderFreeTierButton = () => {
    const modelId = presets.preset6;
    const isActive = activePreset === 'preset6';
    
    // Configure long press for mobile (not needed for FREE tier as it auto-selects)
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
          onClick={(e) => {
            e.stopPropagation();
            setIsFreeTierDialogOpen(true);
          }}
        >
          <Edit size={12} />
        </Button>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {renderPresetButtons()}
        {renderFreeTierButton()}
      </div>
      
      {/* Model selection dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select a Model for Preset {getPresetNumber(currentPresetKey)}</DialogTitle>
            <DialogDescription>
              Choose a model to assign to this preset button.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex items-center space-x-2 mb-4">
              <Input
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              
              <Select value={selectedProvider || ""} onValueChange={(value) => setSelectedProvider(value || null)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Providers</SelectItem>
                  {models && Array.isArray(models) && Object.keys(groupModelsByProvider(models || [])).map(provider => (
                    <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4">
              {Array.isArray(filteredPresetModels) && filteredPresetModels.length > 0 ? (
                React.useMemo(() => {
                  try {
                    // Group models by provider safely
                    const groupedModels = groupModelsByProvider(filteredPresetModels);
                    
                    // Safety check for grouped models
                    if (typeof groupedModels !== 'object' || groupedModels === null) {
                      console.error('Grouped models is not an object:', groupedModels);
                      return <p key="error-grouping">Error grouping models. Please try again.</p>;
                    }
                    
                    const providerEntries = Object.entries(groupedModels);
                    if (!Array.isArray(providerEntries) || providerEntries.length === 0) {
                      return <p>No models available in selected categories.</p>;
                    }
                    
                    // Render provider groups
                    return providerEntries.map(([provider, providerModels]) => (
                      <div key={provider} className="space-y-2">
                        <h3 className="text-sm font-medium">{provider}</h3>
                        <div className="space-y-1">
                          {Array.isArray(providerModels) && providerModels.map((model) => {
                            // Skip invalid models
                            if (!model || !model.id) {
                              return null;
                            }
                            
                            return (
                              <div
                                key={model.id}
                                onClick={() => setSelectedModelId(model.id)}
                                className={`flex justify-between items-center p-2 rounded cursor-pointer ${
                                  selectedModelId === model.id ? 'bg-primary/10' : 'hover:bg-muted'
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{model.name || 'Unnamed Model'}</span>
                                  <span className="text-xs text-muted-foreground">{model.id}</span>
                                </div>
                                {selectedModelId === model.id && (
                                  <Check size={16} className="text-primary" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  } catch (error) {
                    console.error("Error rendering model list:", error);
                    return <p>An error occurred while displaying models. Please try again.</p>;
                  }
                }, [filteredPresetModels, selectedModelId])
              ) : (
                <p>No models found matching your criteria.</p>
              )}
            </div>
          </div>
          
          <DialogFooter className="flex justify-between">
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
              {Array.isArray(freeModels) && freeModels.length > 0 ? (
                /* Safe filtering of free models with defensive checks */
                React.useMemo(() => {
                  // Filter models safely
                  const filteredModels = Array.isArray(freeModels) ? freeModels.filter(model => 
                    model && ((model.name && model.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (model.id && model.id.toLowerCase().includes(searchTerm.toLowerCase())))
                  ) : [];
                  
                  // Return early if no models match
                  if (!Array.isArray(filteredModels) || filteredModels.length === 0) {
                    return <p key="no-matches">No free models match your search term.</p>;
                  }
                  
                  try {
                    // Group models by provider
                    const groupedModels = groupModelsByProvider(filteredModels);
                    
                    // Safety check for grouped models
                    if (typeof groupedModels !== 'object' || groupedModels === null) {
                      console.error('Grouped models is not an object:', groupedModels);
                      return <p key="error-grouping">Error grouping models. Please try again.</p>;
                    }
                    
                    // Render provider groups
                    return Object.entries(groupedModels).map(([provider, providerModels]) => (
                      <div key={provider} className="space-y-2">
                        <h3 className="text-sm font-medium">{provider}</h3>
                        <div className="space-y-1">
                          {Array.isArray(providerModels) && providerModels.map((model) => model && (
                            <div
                              key={model.id}
                              onClick={() => handleSelectFreeModel(model.id)}
                              className={`flex justify-between items-center p-2 rounded cursor-pointer ${
                                presets.preset6 === model.id ? 'bg-primary/10' : 'hover:bg-muted'
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{model.name}</span>
                                <span className="text-xs text-muted-foreground">{model.id}</span>
                              </div>
                              {presets.preset6 === model.id && (
                                <Check size={16} className="text-primary" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  } catch (error) {
                    console.error('Error rendering free models:', error);
                    return <p key="error">Error displaying models. Please try again.</p>;
                  }
                }, [freeModels, searchTerm, presets.preset6])
              ) : (
                <p>No free models found. Try again later.</p>
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
    </div>
  );
};