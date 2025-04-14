import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { useModelSelection } from '@/hooks/useModelSelection';
import { useToast } from '@/hooks/use-toast';
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
import { Network, Edit, Check, Lock, Search, Image, Brain, Sparkles, AlertTriangle } from 'lucide-react';

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
  
  // Helper function to get preset category for tooltip
  const getPresetCategory = (presetKey: string): string => {
    switch(presetKey) {
      case 'preset1':
      case 'preset2':
        return 'All Models';
      case 'preset3':
        return 'Reasoning';
      case 'preset4':
        return 'Multimodal';
      case 'preset5':
        return 'Search';
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
    } else {
      // Return all models for preset1 and preset2
      return models;
    }
  };
  
  // Helper function to consistently set model type and ID
  const handleActivation = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5', modelId: string | null) => {
    if (modelId) {
      // Set the selected model ID
      setSelectedModelId(modelId);
      
      // All model types are now "openrouter" - we only set the specific model ID
      setSelectedModel('openrouter');
      
      // Set the custom OpenRouter model ID (important for the actual API call)
      setCustomOpenRouterModelId(modelId);
      
      // Log model activation with capabilities info for debugging
      const modelCapabilities = isMultimodalModel(modelId) ? 'vision-capable' : 'text-only';
      console.log(`Model activated: ${modelId}, Capabilities: ${modelCapabilities}, Preset: ${presetKey}`);
      
      // Map legacy preset types to model IDs in logs for backward compatibility tracking
      if (presetKey === 'preset3') {
        console.log(`Legacy preset mapping: preset3 (was reasoning) → ${modelId}`);
      } else if (presetKey === 'preset4') {
        console.log(`Legacy preset mapping: preset4 (was multimodal) → ${modelId}`);
      } else if (presetKey === 'preset5') {
        console.log(`Legacy preset mapping: preset5 (was search) → ${modelId}`);
      }
    } else {
      // If no model is assigned to this preset yet, just set the type to openrouter
      // We'll keep track of the preset for UX purposes but all models go through OpenRouter
      setSelectedModel('openrouter');
      
      // For debugging, log which legacy preset was selected
      console.log(`Empty model selection for preset: ${presetKey}`);
      
      // Clear any previous custom model ID when no specific model is selected
      setCustomOpenRouterModelId(null);
    }
  };

  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5') => {
    let modelId = activatePreset(presetKey);
    
    // Handle legacy model type strings if encountered in the stored settings
    // This provides backward compatibility with previously saved presets
    if (typeof modelId === 'string') {
      // Map legacy model types to actual OpenRouter model IDs
      if (modelId === 'reasoning') {
        modelId = 'openai/o3-mini-high'; // Map reasoning to o3 Mini
        console.log(`Mapped legacy 'reasoning' type to OpenRouter model: ${modelId}`);
      } else if (modelId === 'search') {
        modelId = 'perplexity/sonar-pro'; // Map search to Sonar Pro
        console.log(`Mapped legacy 'search' type to OpenRouter model: ${modelId}`);
      } else if (modelId === 'multimodal') {
        modelId = 'openai/gpt-4o'; // Map multimodal to GPT-4o (vision capable)
        console.log(`Mapped legacy 'multimodal' type to OpenRouter model: ${modelId}`);
      }
    }
    
    // Only proceed if there's an actual model assigned to this preset
    if (modelId) {
      // If this preset has a model assigned to it, use that model
      handleActivation(presetKey, modelId);
      
      console.log(`Preset ${presetKey} activated with model: ${modelId}`);
    } else {
      // If no model is assigned, show a toast notification
      toast({
        title: "No Model Assigned",
        description: `Preset ${getPresetNumber(presetKey)} doesn't have a model assigned yet. Click the edit button to assign a model.`,
        variant: "destructive",
      });
    }
  };
  

  
  // Access toast
  const { toast } = useToast();
  
  // Handle free tier button click
  const handleFreeTierClick = () => {
    // If no free tier model is active, open the selection dialog
    if (!activeFreeTierModel) {
      // First check if we have any free models available
      if (freeModels.length === 0) {
        toast({
          title: "No Free Models Available",
          description: "There are currently no free models available. Check back later or select a different model.",
          variant: "destructive",
        });
        return;
      }
      
      setIsFreeTierDialogOpen(true);
    } else {
      // If a free tier model is already active, switch to it immediately
      
      // First ensure we clear any active preset to fix the visual highlighting
      activatePreset(null as any);
      
      // Now activate the free tier model - We need to set both model type AND the specific model ID
      setSelectedModel('openrouter');
      setCustomOpenRouterModelId(activeFreeTierModel);
      
      console.log(`Free tier model activated: ${activeFreeTierModel}`);
    }
  };
  
  // Handle selecting a free model
  const handleSelectFreeModel = (modelId: string) => {
    // First clear any active preset to fix the visual highlighting
    activatePreset(null as any);
    
    // Set the active free tier model
    activateFreeTierModel(modelId);
    
    // Directly set the model type and ID to ensure it's applied immediately
    setSelectedModel('openrouter');
    setCustomOpenRouterModelId(modelId);
    
    // Log for debugging
    console.log(`Free model selected and activated: ${modelId}`);
    
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

  // Render presets
  const renderPresets = () => {
    return Object.entries(presets).map(([key, modelId]) => {
      const isActive = activePreset === key;
      const presetKey = key as 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5';
      
      // Check if this preset model is a free model
      const isFreeTier = modelId ? freeModels.some(model => model.id === modelId) : false;
      
      // Determine if this model should be locked (non-free model and no credits)
      const isLocked = !isFreeTier && !hasCredits && modelId;
      
      // Configure long press for mobile
      const longPressProps = useLongPress(() => {
        if (!isLocked && !isLoading && !isPending) {
          setCurrentPresetKey(presetKey);
          setSelectedModelId(presets[presetKey] || '');
          setIsDialogOpen(true);
        }
      });
      
      return (
        <div key={key} className="relative group">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={isLocked ? handleLockedModelClick : () => handleClick(presetKey)}
                  variant={isActive ? "default" : "outline"}
                  className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 ${
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'
                  } ${isLocked ? 'cursor-pointer' : ''}`}
                  disabled={isLoading || isPending}
                  {...longPressProps}
                >
                  {getPresetIcon(presetKey, modelId || '')}
                  {modelId ? (
                    <span className="truncate max-w-[100px]">
                      {modelId === 'reasoning' ? 'o3 Mini H' : 
                       modelId === 'search' ? 'Sonar Pro' : 
                       modelId === 'openai/o3-mini-high' ? 'o3 Mini H' :
                       formatModelName(modelId)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Preset {getPresetNumber(key)}</span>
                  )}
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
  
  // Render free tier button (now with same design pattern as presets)
  const renderFreeTierButton = () => {
    // If no free models are available, show disabled button
    if (freeModels.length === 0) {
      return (
        <div className="relative group">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled
                  variant="outline"
                  className="flex items-center gap-1 py-2 px-3 text-sm border-gray-400 text-gray-500"
                >
                  <AlertTriangle size={16} className="mr-1" />
                  <span>No Free Models</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>No free models are currently available on OpenRouter</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }
    
    // Only consider the free tier model active if there's a selected model AND no preset is active
    const isActive = !!activeFreeTierModel && !activePreset;
    
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
                className={`flex items-center gap-1 py-2 px-3 text-sm transition-all duration-200 ${
                  isActive ? 'bg-green-600 text-white border-green-500' : 'text-green-600 border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
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
              Select a model from the list below to assign to this preset. On desktop, click the edit icon on a preset button to change this assignment. On mobile, long-press the preset button.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Input
              placeholder="Search models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            
            <div className="space-y-4">
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider} className="space-y-2">
                  <h3 className="text-sm font-medium">{provider}</h3>
                  <div className="space-y-1">
                    {providerModels.map(model => (
                      <Button
                        key={model.id}
                        variant="outline"
                        className={`w-full justify-between text-left h-auto py-2 ${selectedModelId === model.id ? 'bg-primary/10 border-primary/50' : ''}`}
                        onClick={() => {
                          // Immediately assign and activate the model
                          assignModelToPreset(currentPresetKey, model.id);
                          handleActivation(currentPresetKey, model.id);
                          
                          // Close dialog
                          setIsDialogOpen(false);
                          
                          // Reset UI state
                          setFilteredPresetModels([]);
                          setSearchTerm('');
                        }}
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
                        {selectedModelId === model.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(groupedModels).length === 0 && (
                <p className="text-center text-muted-foreground">No models found</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
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
              These models are available at no cost. Select a model to use it immediately. On mobile, you can long-press the Free Tier button to access this selection.
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
                          className={`w-full justify-between text-left h-auto py-2 ${activeFreeTierModel === model.id ? 'bg-green-100 dark:bg-green-950 border-green-500' : ''}`}
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
                          {activeFreeTierModel === model.id && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
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