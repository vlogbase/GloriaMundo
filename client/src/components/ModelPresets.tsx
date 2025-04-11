// client/src/components/ModelPresets.tsx
// Corrected version

import React, { useState, useEffect, useMemo } from 'react'; // Ensure React and useMemo are imported
import { Button } from '@/components/ui/button';
import { useModelPresets } from '@/hooks/useModelPresets';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { useModelSelection } from '@/hooks/useModelSelection';
import { ModelType } from '@/lib/types';
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
// useLongPress should be imported if PresetButton/FreeTierButton don't import it themselves
// import { useLongPress } from '@/hooks/useLongPress';
import PresetButton from './PresetButton';
import FreeTierButton from './FreeTierButton';

// Helper function to get the preset number from the key
const getPresetNumber = (key: string): string => {
  return key.replace('preset', '');
};

// Helper function to group models by provider
const groupModelsByProvider = (models: any[]) => {
  const grouped: Record<string, any[]> = {};

  // Ensure models is an array before proceeding
  if (!Array.isArray(models)) {
      console.error('groupModelsByProvider received non-array:', models);
      return grouped; // Return empty object if input is not an array
  }

  models.forEach(model => {
      // Basic check for model structure
      if (!model || typeof model.id !== 'string') {
          console.warn('Skipping invalid model structure:', model);
          return;
      }
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
    activeFreeTierModel, // Keep if used elsewhere, otherwise potentially remove if presets['preset6'] is sufficient
    freeModels,
    assignModelToPreset,
    activatePreset,
    activateFreeTierModel, // Keep if used elsewhere
    getModelNameById, // Keep if used elsewhere
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
            return null; // Not logged in
          }
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null; // Treat errors as not logged in or no data
      }
    }
  });

  // Check if user has credits (positive balance)
  const hasCredits = !!user && !!user.creditBalance && user.creditBalance > 0;

  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isFreeTierDialogOpen, setIsFreeTierDialogOpen] = useState<boolean>(false);
  const [currentPresetKey, setCurrentPresetKey] = useState<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6'>('preset1');
  const [filteredPresetModels, setFilteredPresetModels] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Initialize the free tier preset when models are available
  useEffect(() => {
    // Ensure freeModels is an array before checking length
    if (Array.isArray(freeModels) && freeModels.length > 0) {
      initializeFreeTierPreset();
    }
  }, [freeModels, initializeFreeTierPreset]); // Added initializeFreeTierPreset dependency


  // Helper function to filter models for specific presets
  const filterModelsForPreset = (presetKey: string): any[] => {
    // Ensure models is an array before filtering
     if (!Array.isArray(models)) return [];

    if (presetKey === 'preset3') {
      return models.filter(model => model && typeof model.id === 'string' && isReasoningModel(model.id));
    } else if (presetKey === 'preset4') {
      return models.filter(model => model && typeof model.id === 'string' && isMultimodalModel(model.id));
    } else if (presetKey === 'preset5') {
      return models.filter(model => model && typeof model.id === 'string' && isPerplexityModel(model.id));
    } else if (presetKey === 'preset6') {
      // Filter from the main `models` list, checking the `isFree` property
      return models.filter(model => model && model.isFree === true);
    } else {
      // Return all models for preset1 and preset2
      return models;
    }
  };


  // Update filtered models when filters change
  useEffect(() => {
    let presetModels = filterModelsForPreset(currentPresetKey);

    if (searchTerm) {
        presetModels = presetModels.filter(model =>
            model &&
            ((model.name && model.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
             (model.id && model.id.toLowerCase().includes(searchTerm.toLowerCase())))
        );
    }

    if (selectedProvider) {
        presetModels = presetModels.filter(model => {
            if (!model || typeof model.id !== 'string') return false;
            const parts = model.id.split('/');
            const provider = parts.length > 1 ? parts[0] : 'Other';
            return provider === selectedProvider;
        });
    }

    setFilteredPresetModels(presetModels);
  }, [searchTerm, selectedProvider, currentPresetKey, models]); // `models` dependency is important


  // Helper function to check if a model is a multimodal model (supports images)
   const isMultimodalModel = (modelId: string): boolean => {
        if (typeof modelId !== 'string') return false; // Type guard
        const multimodalModels = [
            'openai/gpt-4o', 'openai/gpt-4-vision',
            'anthropic/claude-3-opus', 'anthropic/claude-3-sonnet', 'anthropic/claude-3.5-sonnet', 'anthropic/claude-3.7-sonnet', 'anthropic/claude-3-haiku',
            'x-ai/grok-2',
            'google/gemini', 'google/gemini-pro', 'google/gemini-1.5-pro', 'google/gemini-2.0-pro', 'google/gemini-2.5-pro', 'google/gemini-2.5-pro-exp-03-25',
            'mistral/mercury-beta'
        ];
        const lowerModelId = modelId.toLowerCase();
        return multimodalModels.some(model =>
            lowerModelId === model.toLowerCase() ||
            lowerModelId.includes(model.toLowerCase().replace(/\s+/g, '-'))
        );
    };

  // Helper function to check if a model is a Perplexity model
  const isPerplexityModel = (modelId: string): boolean => {
       if (typeof modelId !== 'string') return false; // Type guard
       return modelId.toLowerCase().includes('perplexity');
  };

  // Helper function to check if a model is a reasoning model from the provided list
  const isReasoningModel = (modelId: string): boolean => {
      if (typeof modelId !== 'string') return false; // Type guard
      const reasoningModels = [
          'openai/o1', 'openai/o1-pro', 'openai/o1-preview', 'openai/o1-mini', 'openai/o1-mini (2024-09-12)', 'openai/o3-mini', 'openai/o3-mini-high',
          'perplexity/r1-1776',
          'anthropic/claude-3.7-sonnet-thinking',
          'deepseek/r1-zero', 'deepseek/r1',
          'qwen/qwq-32b',
          'google/gemini-2.0-flash-thinking', 'google/gemini-2.5-pro-preview-03-25'
      ];
      const lowerModelId = modelId.toLowerCase();
      return reasoningModels.some(model =>
          lowerModelId === model.toLowerCase() ||
          lowerModelId.includes(model.toLowerCase().replace(/\s+/g, '-'))
      );
  };


  // Handler for showing the edit dialog
  const handleEditClick = (e: React.MouseEvent, presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => {
    e.stopPropagation();

    if (presetKey === 'preset6') {
      // Open free tier dialog instead for preset6 edit
      setIsFreeTierDialogOpen(true);
      setSearchTerm(''); // Reset search term for free dialog
      return;
    }

    setCurrentPresetKey(presetKey);
    // No need to manually setFilteredPresetModels here, useEffect will handle it based on currentPresetKey change
    setIsDialogOpen(true);
    setSearchTerm('');
    setSelectedProvider(null);
  };

  // Handler for clicking a locked model
  const handleLockedModelClick = () => {
    navigate('/credits');
  };

  // Helper function to get preset title with model name
  const getPresetTitle = (presetKey: string, modelId: string | null): string => {
      if (!presets || typeof presets !== 'object') return `${getPresetNumber(presetKey)}: Error`; // Handle presets loading/error state

      // Get the actual modelId from the potentially updated presets object for accuracy
      const currentModelId = presets[presetKey as keyof typeof presets] || modelId;

      const presetNumber = getPresetNumber(presetKey);

      if (presetKey === 'preset6') {
          if (currentModelId) {
              let modelName = formatModelName(currentModelId);
              if (modelName.length > 10) {
                  modelName = modelName.substring(0, 10) + '...';
              }
              return `FREE: ${modelName}`;
          }
          return 'FREE';
      }

      if (currentModelId) {
          let modelName = formatModelName(currentModelId);
          return `${presetNumber}: ${modelName}`;
      } else {
          return `${presetNumber}: Select`;
      }
  };


  // Helper function to get preset category
   const getPresetCategory = (presetKey: string): string => {
        switch (presetKey) {
            case 'preset1': return 'General Purpose';
            case 'preset2': return 'All Models';
            case 'preset3': return 'Reasoning';
            case 'preset4': return 'Multimodal';
            case 'preset5': return 'Search';
            case 'preset6': return 'Free Tier';
            default: return 'Model Preset';
        }
    };

  // Helper function to get preset-specific icon
  const getPresetIcon = (presetKey: string, modelId: string | null): React.ReactNode => {
      // Use currentModelId for accuracy if available from presets
      const currentModelId = presets && presets[presetKey as keyof typeof presets] ? presets[presetKey as keyof typeof presets] : modelId;

      if (presetKey === 'preset3') return <Brain size={16} className="mr-1" />;
      if (presetKey === 'preset4') return <Image size={16} className="mr-1" />;
      if (presetKey === 'preset5') return <Search size={16} className="mr-1" />;
      if (presetKey === 'preset6') return <Sparkles size={16} className="mr-1" />;
      // Default for preset1, preset2, or if modelId is null/other cases
      return <Network size={16} className="mr-1" />;
  };


  // Helper function to consistently set model type and ID
  const handleActivation = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6', modelId: string | null) => {
      if (modelId) {
          setSelectedModelId(modelId); // Update selection state

          // Define modelType as the ModelType type
          let modelType: ModelType = "openrouter"; // Default type
          if (presetKey === 'preset3') modelType = "reasoning";
          else if (presetKey === 'preset4') modelType = "multimodal";
          else if (presetKey === 'preset5') modelType = "search";
          else if (isMultimodalModel(modelId)) modelType = "multimodal"; // Check even for general/free presets

          setSelectedModel(modelType);
          setCustomOpenRouterModelId(modelId); // Set for API call

          console.log(`Model activated: ${modelId}, Type: ${modelType}`);
      } else {
          // Handle case where no model is assigned (e.g., initial state or after clearing)
          // Define defaultType as the ModelType type
          let defaultType: ModelType = "openrouter";
          if (presetKey === 'preset3') defaultType = "reasoning";
          else if (presetKey === 'preset4') defaultType = "multimodal";
          else if (presetKey === 'preset5') defaultType = "search";
          setSelectedModel(defaultType);
          // Clear custom ID if no model is selected for the active preset
          setCustomOpenRouterModelId('');
           console.log(`Preset ${presetKey} activated with no model, type set to: ${defaultType}`);
      }
  };

  // Handle click to activate a preset
  const handleClick = (presetKey: 'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5' | 'preset6') => {
    const modelId = activatePreset(presetKey); // This updates the internal preset state and returns the modelId
    handleActivation(presetKey, modelId); // This updates the global model selection based on the activated preset
  };


  // Handle selecting a free model from the dialog
  const handleSelectFreeModel = (modelId: string) => {
    if (modelId) {
       assignModelToPreset('preset6', modelId); // Assign to preset6 specifically
       handleActivation('preset6', modelId); // Activate preset6 with this model
       setIsFreeTierDialogOpen(false);
       setSearchTerm(''); // Reset search term
    }
  };

  // Save selected model to the *currently open* preset dialog and activate it immediately
  const saveModelToPreset = () => {
    if (selectedModelId && currentPresetKey && currentPresetKey !== 'preset6') { // Ensure we have a selected model and a valid, non-free preset key
      assignModelToPreset(currentPresetKey, selectedModelId);
      handleActivation(currentPresetKey, selectedModelId); // Activate the preset we just saved to

      setIsDialogOpen(false);
      // Reset dialog state
      // setSelectedModelId(null); // Maybe keep the selection? Depends on desired UX
      setSearchTerm('');
      setSelectedProvider(null);
    } else {
       console.warn("Save conditions not met:", {selectedModelId, currentPresetKey});
    }
  };


  // --- Start of Refactored useMemo section ---

  // Memoize the content for the main model selection dialog
  const memoizedModelDialogContent = useMemo(() => {
      // This hook now runs unconditionally.
      // We check the condition *inside* the hook's calculation.
      if (!Array.isArray(filteredPresetModels) || filteredPresetModels.length === 0) {
          return <p>No models found matching your criteria.</p>; // Return fallback JSX if no models
      }
      try {
          const groupedModels = groupModelsByProvider(filteredPresetModels);

          if (typeof groupedModels !== 'object' || groupedModels === null) {
              console.error('Grouped models is not an object:', groupedModels);
              return <p key="error-grouping">Error grouping models. Please try again.</p>;
          }

          const providerEntries = Object.entries(groupedModels);
          if (!Array.isArray(providerEntries) || providerEntries.length === 0) {
              // This case might be redundant if filteredPresetModels already checked, but safe to keep
              return <p>No models available for the selected provider or filters.</p>;
          }

          // Render provider groups
          return providerEntries.map(([provider, providerModels]) => (
              <div key={provider} className="space-y-2">
                  <h3 className="text-sm font-medium">{provider}</h3>
                  <div className="space-y-1">
                      {Array.isArray(providerModels) && providerModels.map((model) => {
                          if (!model || !model.id) return null; // Skip invalid models
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
  }, [filteredPresetModels, selectedModelId]); // Dependencies

  // Memoize the content for the free tier model selection dialog
  const memoizedFreeDialogContent = useMemo(() => {
      // This hook runs unconditionally.
      // We check the condition *inside*.
       if (!Array.isArray(freeModels) || freeModels.length === 0) {
            return <p>No free models available at this time.</p>; // Adjusted message
       }

      // Filter models safely based on search term
      const filteredModels = freeModels.filter(model =>
          model &&
          ((model.name && model.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
           (model.id && model.id.toLowerCase().includes(searchTerm.toLowerCase())))
      );

      if (filteredModels.length === 0) {
          return <p key="no-matches">No free models match your search term.</p>;
      }

      try {
          const groupedModels = groupModelsByProvider(filteredModels);

          if (typeof groupedModels !== 'object' || groupedModels === null) {
              console.error('Grouped models is not an object:', groupedModels);
              return <p key="error-grouping-free">Error grouping models. Please try again.</p>;
          }

          const providerEntries = Object.entries(groupedModels);
           if (!Array.isArray(providerEntries) || providerEntries.length === 0) {
                // Should not happen if filteredModels is not empty, but safeguard
                return <p>Error displaying grouped models.</p>;
            }


          // Render provider groups
          return providerEntries.map(([provider, providerModels]) => (
              <div key={provider} className="space-y-2">
                  <h3 className="text-sm font-medium">{provider}</h3>
                  <div className="space-y-1">
                      {Array.isArray(providerModels) && providerModels.map((model) => {
                           if (!model || !model.id) return null; // Skip invalid models
                           return (
                              <div
                                  key={model.id}
                                  onClick={() => handleSelectFreeModel(model.id)} // Use specific handler
                                  className={`flex justify-between items-center p-2 rounded cursor-pointer ${
                                      // Check against the actual assigned model in presets, not just selection state
                                      presets?.preset6 === model.id ? 'bg-primary/10' : 'hover:bg-muted'
                                  }`}
                              >
                                  <div className="flex flex-col">
                                      <span className="text-sm font-medium">{model.name || 'Unnamed Model'}</span>
                                      <span className="text-xs text-muted-foreground">{model.id}</span>
                                  </div>
                                  {presets?.preset6 === model.id && ( // Check assigned model
                                      <Check size={16} className="text-primary" />
                                  )}
                              </div>
                           );
                      })}
                  </div>
              </div>
          ));
      } catch (error) {
          console.error('Error rendering free models:', error);
          return <p key="error-free">Error displaying models. Please try again.</p>;
      }
  }, [freeModels, searchTerm, presets?.preset6, handleSelectFreeModel]); // Dependencies updated

  // --- End of Refactored useMemo section ---


  // Render preset buttons (1-5)
  const renderPresetButtons = () => {
    if (!presets || typeof presets !== 'object') {
        return <p>Loading presets...</p>; // Handle loading/error state
    }
    const presetKeys = Object.keys(presets).filter(key => key !== 'preset6') as Array<'preset1' | 'preset2' | 'preset3' | 'preset4' | 'preset5'>;

    return presetKeys.map((presetKey) => {
        const modelId = presets[presetKey];
        const isActive = activePreset === presetKey;

        // Pass necessary props to PresetButton
        return (
            <PresetButton
                key={presetKey}
                presetKey={presetKey}
                modelId={modelId}
                isActive={isActive}
                hasCredits={hasCredits}
                isLoading={isLoading}
                isPending={isPending}
                getPresetIcon={getPresetIcon}
                getPresetTitle={getPresetTitle}
                getPresetCategory={getPresetCategory}
                handleClick={handleClick}
                handleEditClick={handleEditClick} // Pass the main handler
                handleLockedModelClick={handleLockedModelClick}
                // onLongPress is handled internally by PresetButton using its own handleEditClick call
            />
        );
    });
  };

  // Render FREE tier button (preset6)
  const renderFreeTierButton = () => {
     if (!presets || typeof presets !== 'object') {
        return null; // Don't render if presets not loaded
    }
    const modelId = presets.preset6;
    const isActive = activePreset === 'preset6';

    return (
        <FreeTierButton
            modelId={modelId}
            isActive={isActive}
            isLoading={isLoading}
            isPending={isPending}
            getPresetIcon={getPresetIcon}
            getPresetTitle={getPresetTitle}
            handleClick={handleClick} // Use the main handleClick for activation
            handleEditClick={(e) => { // Define the edit action specifically for free tier
                e.stopPropagation();
                setIsFreeTierDialogOpen(true);
                setSearchTerm(''); // Reset search term for free dialog
            }}
        />
    );
  };


  // MAIN RETURN STATEMENT
  return (
    <div className="flex flex-col space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {renderPresetButtons()}
        {renderFreeTierButton()}
      </div>

      {/* Model selection dialog (for presets 1-5) */}
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
                  {/* Safely generate provider options */}
                  {useMemo(() => {
                       if (!Array.isArray(models)) return null;
                       try {
                           const grouped = groupModelsByProvider(models);
                           return Object.keys(grouped).sort().map(provider => ( // Added sorting
                               <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                           ));
                       } catch (error) {
                           console.error("Error generating provider list:", error);
                           return null;
                       }
                   }, [models])}
                </SelectContent>
              </Select>
            </div>

            {/* Render the memoized dialog content */}
            <div className="space-y-4">
              {memoizedModelDialogContent}
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveModelToPreset} disabled={!selectedModelId || isPending || currentPresetKey === 'preset6'}>
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

            {/* Render the memoized free dialog content */}
            <div className="space-y-4">
              {memoizedFreeDialogContent}
            </div>
          </div>

          <DialogFooter>
             {/* No Save button needed, selection is immediate via onClick in the list */}
            <Button variant="outline" onClick={() => setIsFreeTierDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};