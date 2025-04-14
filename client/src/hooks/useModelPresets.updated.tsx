import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOpenRouterModels } from './useOpenRouterModels';
import { useToast } from './use-toast';
import { cookieUtils } from '@/lib/utils';

// Define the ModelPresets type
export interface ModelPresets {
  preset1: string | null;
  preset2: string | null;
  preset3: string | null;
  preset4: string | null;
  preset5: string | null;
}

// Priority list for free models
export const DEFAULT_FREE_MODEL_PRIORITIES = [
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwq-32b:free",
  "deepseek/deepseek-r1-distill-qwen-32b:free", 
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "openrouter/optimus-alpha"
];

// Default model presets with verified valid model IDs from OpenRouter
const defaultPresets: ModelPresets = {
  preset1: 'google/gemini-2.5-pro-exp-03-25:free', // Changed from GPT-4.5 to Gemini 2.5 Pro (free version)
  preset2: 'anthropic/claude-3.7-sonnet',          // All models preset 2
  preset3: 'openai/o3-mini-high',                  // Reasoning preset
  preset4: 'openai/gpt-4o',                        // Multimodal preset
  preset5: 'anthropic/claude-3-haiku'              // Search preset
};

interface ModelPresetsContextType {
  presets: ModelPresets;
  isLoading: boolean;
  isPending: boolean;
  activePreset: string | null;
  activeFreeTierModel: string | null;
  freeModels: any[];
  assignModelToPreset: (presetKey: keyof ModelPresets, modelId: string) => void;
  activatePreset: (presetKey: keyof ModelPresets) => string | null;
  activateFreeTierModel: (modelId: string) => void;
  getModelNameById: (modelId: string) => string;
  formatModelName: (modelId: string) => string;
  normalizeModelId: (modelId: string) => string;
}

const ModelPresetsContext = createContext<ModelPresetsContextType | undefined>(undefined);

// Cookie name for storing the last selected free model
const LAST_FREE_MODEL_COOKIE = 'gloriaLastFreeModel';

export const ModelPresetsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const [lastUsedFreeModel, setLastUsedFreeModel] = useState<string | null>(
    cookieUtils.get(LAST_FREE_MODEL_COOKIE) || null
  );
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasInitializedFreeModel = useRef(false);
  const isProcessingModelChange = useRef(false);

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1ModelId || defaultPresets.preset1,
      preset2: data?.preset2ModelId || defaultPresets.preset2,
      preset3: data?.preset3ModelId || defaultPresets.preset3,
      preset4: data?.preset4ModelId || defaultPresets.preset4,
      preset5: data?.preset5ModelId || defaultPresets.preset5
    })
  });
  
  // Update presets state when data changes
  useEffect(() => {
    if (data) {
      setPresets(data);
    }
  }, [data]);

  // Filter for free models
  const freeModels = models.filter(model => model.isFree === true);
  
  // Function to find the first available free model from the priority list
  const findDefaultFreeModel = (availableFreeModels: any[]): string | null => {
    // Try to find models from the priority list first
    for (const modelId of DEFAULT_FREE_MODEL_PRIORITIES) {
      const foundModel = availableFreeModels.find(model => model.id === modelId);
      if (foundModel) {
        return foundModel.id;
      }
    }
    
    // If no priority models are available, return the first free model as fallback
    return availableFreeModels.length > 0 ? availableFreeModels[0].id : null;
  };
  
  // Initialize default free model when free models are loaded
  useEffect(() => {
    // Only proceed if:
    // 1. We have free models
    // 2. We haven't already initialized
    // 3. No free tier model is currently active
    // 4. We're not in the middle of processing a model change
    if (
      freeModels.length > 0 && 
      !hasInitializedFreeModel.current && 
      !activeFreeTierModel &&
      !isProcessingModelChange.current &&
      !isLoading
    ) {
      console.log('Initializing default free model...');
      
      // Check for previously used free model from cookie
      let modelToUse: string | null = null;
      
      // If we have a last used free model in cookie, check if it's still available
      if (lastUsedFreeModel) {
        const isModelStillAvailable = freeModels.some(model => model.id === lastUsedFreeModel);
        if (isModelStillAvailable) {
          console.log(`Using last used free model from cookie: ${lastUsedFreeModel}`);
          modelToUse = lastUsedFreeModel;
        } else {
          console.log(`Last used free model ${lastUsedFreeModel} is no longer available, using fallback`);
        }
      }
      
      // If no stored model or stored model isn't available, use priority list
      if (!modelToUse) {
        console.log('Finding default free model from priority list...');
        modelToUse = findDefaultFreeModel(freeModels);
      }
      
      if (modelToUse) {
        hasInitializedFreeModel.current = true;
        isProcessingModelChange.current = true;
        
        // Set a small delay to avoid potential race conditions
        setTimeout(() => {
          setActiveFreeTierModel(modelToUse!);
          
          // Also store this as the last used free model
          setLastUsedFreeModel(modelToUse);
          cookieUtils.set(LAST_FREE_MODEL_COOKIE, modelToUse, { expires: 365 }); // Save for 1 year
          
          console.log(`Default free model set to: ${modelToUse}`);
          isProcessingModelChange.current = false;
        }, 100);
      }
    }
  }, [freeModels, activeFreeTierModel, isLoading, lastUsedFreeModel]);

  // Mutation to update presets
  const { mutate, isPending } = useMutation({
    mutationFn: async (newPresets: ModelPresets) => {
      console.log('Sending presets data to server:', newPresets);
      
      // Format presets exactly as the backend schema expects (preset1, preset2, etc.)
      // The backend validation expects this format according to server/routes.ts
      const formattedPresets = {
        preset1: newPresets.preset1,
        preset2: newPresets.preset2,
        preset3: newPresets.preset3,
        preset4: newPresets.preset4,
        preset5: newPresets.preset5,
      };
      
      console.log('Formatted presets for API:', formattedPresets);
      const response = await apiRequest('PUT', '/api/user/presets', formattedPresets);
      
      console.log('Server response:', response);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/presets'] });
      toast({
        title: 'Preset Updated',
        description: 'Your model preset has been saved.',
      });
    },
    onError: (error) => {
      // Log the detailed error for debugging
      console.error('Error updating preset:', error);
      let errorMsg = 'Failed to update preset. Please try again.';
      
      // Try to extract more useful error information if available
      if (error instanceof Error) {
        errorMsg = error.message || errorMsg;
      } else if (typeof error === 'object' && error !== null) {
        errorMsg = JSON.stringify(error);
      }
      
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  });

  // Normalize model IDs to handle special model variants like ":thinking"
  const normalizeModelId = (modelId: string): string => {
    if (!modelId) return "";
    
    // Remove any thinking or special suffixes (for Claude models)
    return modelId.replace(/:thinking$/, '').trim();
  };

  // Format model name to display cleaner version
  const formatModelName = (modelId: string): string => {
    if (!modelId) return "";
    
    // First normalize the ID to remove any special suffixes
    const normalizedId = normalizeModelId(modelId);
    
    // Apply specific formatting rules for required models
    if (normalizedId.includes('openai/o3-mini-high')) {
      return 'o3 Mini H';
    } else if (normalizedId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (normalizedId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (normalizedId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (normalizedId.includes('google/gemini-2.5-pro')) {
      return 'Gemini 2.5 Pro'; // Added for new preset 1 default
    } else if (normalizedId.includes('google/gemini-2.0-flash-001')) {
      return 'Gemini 2.0 Flash';
    } else if (normalizedId === 'anthropic/claude-3-haiku') {
      return 'Claude 3 Haiku';
    } else if (normalizedId === 'anthropic/claude-3-opus') {
      return 'Claude 3 Opus';
    } else if (normalizedId.includes('x-ai/grok-2-1212')) {
      return 'Grok 2';
    } else if (normalizedId.includes('openai/gpt-4o')) {
      return 'GPT-4o';
    } else if (normalizedId.includes('openai/gpt-4.5-preview')) {
      return 'GPT-4.5';
    }
    
    // Generic formatting for other models
    const parts = normalizedId.split('/');
    if (parts.length > 1) {
      // Get the part after the provider
      let modelName = parts[1];
      // Replace hyphens with spaces
      modelName = modelName.replace(/-/g, ' ');
      // Capitalize first letter of each word
      return modelName.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return modelId; // If all else fails, return the ID
  };

  // Get model name by ID with improved formatting
  const getModelNameById = (modelId: string): string => {
    // First check if model exists in the fetched list
    const model = models.find(m => m.id === modelId);
    
    if (model) {
      return model.name;
    } else if (modelId) {
      // If model not in the list but we have an ID, format it
      return formatModelName(modelId);
    }
    
    return "Select Model"; // Default fallback
  };

  // Assign a model to a preset
  const assignModelToPreset = (presetKey: keyof ModelPresets, modelId: string) => {
    const updatedPresets = { ...presets, [presetKey]: modelId };
    setPresets(updatedPresets);
    mutate(updatedPresets);
  };

  // Activate a preset (set as active and return the modelId)
  const activatePreset = (presetKey: keyof ModelPresets): string | null => {
    const modelId = presets[presetKey];
    setActivePreset(presetKey);
    
    // We don't clear the activeFreeTierModel anymore to keep track of the last used free model
    // But we do visually deactivate it in the UI by setting activePreset
    
    return modelId;
  };

  // Activate a free tier model
  const activateFreeTierModel = (modelId: string): void => {
    setActiveFreeTierModel(modelId);
    setActivePreset(null); // Deactivate preset when free tier is activated
    
    // Store the free model ID in a cookie for persistence
    if (modelId) {
      setLastUsedFreeModel(modelId);
      cookieUtils.set(LAST_FREE_MODEL_COOKIE, modelId, { expires: 365 }); // Save for 1 year
      console.log(`Saved free model to cookie: ${modelId}`);
    }
  };

  const value = {
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
    normalizeModelId
  };

  return (
    <ModelPresetsContext.Provider value={value}>
      {children}
    </ModelPresetsContext.Provider>
  );
};

// Hook for consuming the context
export const useModelPresets = (): ModelPresetsContextType => {
  const context = useContext(ModelPresetsContext);
  if (!context) {
    throw new Error('useModelPresets must be used within a ModelPresetsProvider');
  }
  return context;
};

// Create a standalone version for components that don't have access to the provider
export const useStandaloneModelPresets = (): ModelPresetsContextType => {
  // Note: This uses the same defaultPresets from above, which has been updated to use Claude 3.7 Sonnet for preset2
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasInitializedFreeModel = useRef(false);
  const isProcessingModelChange = useRef(false);

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1ModelId || defaultPresets.preset1,
      preset2: data?.preset2ModelId || defaultPresets.preset2,
      preset3: data?.preset3ModelId || defaultPresets.preset3,
      preset4: data?.preset4ModelId || defaultPresets.preset4,
      preset5: data?.preset5ModelId || defaultPresets.preset5
    })
  });
  
  // Update presets state when data changes
  useEffect(() => {
    if (data) {
      setPresets(data);
    }
  }, [data]);

  // Filter for free models
  const freeModels = models.filter(model => model.isFree === true);
  
  // Function to find the first available free model from the priority list
  const findDefaultFreeModel = (availableFreeModels: any[]): string | null => {
    // Try to find models from the priority list first
    for (const modelId of DEFAULT_FREE_MODEL_PRIORITIES) {
      const foundModel = availableFreeModels.find(model => model.id === modelId);
      if (foundModel) {
        return foundModel.id;
      }
    }
    
    // If no priority models are available, return the first free model as fallback
    return availableFreeModels.length > 0 ? availableFreeModels[0].id : null;
  };
  
  // Initialize default free model when free models are loaded
  useEffect(() => {
    // Only proceed if:
    // 1. We have free models
    // 2. We haven't already initialized
    // 3. No free tier model is currently active
    // 4. We're not in the middle of processing a model change
    if (
      freeModels.length > 0 && 
      !hasInitializedFreeModel.current && 
      !activeFreeTierModel &&
      !isProcessingModelChange.current &&
      !isLoading
    ) {
      console.log('Initializing default free model from priority list (standalone)...');
      
      // For standalone we don't need to check the cookie - it will work the same way
      const defaultFreeModel = findDefaultFreeModel(freeModels);
      
      if (defaultFreeModel) {
        hasInitializedFreeModel.current = true;
        isProcessingModelChange.current = true;
        
        // Set a small delay to avoid potential race conditions
        setTimeout(() => {
          setActiveFreeTierModel(defaultFreeModel);
          console.log(`Default free model set to: ${defaultFreeModel} (standalone)`);
          isProcessingModelChange.current = false;
        }, 100);
      }
    }
  }, [freeModels, activeFreeTierModel, isLoading]);

  // Mutation to update presets
  const { mutate, isPending } = useMutation({
    mutationFn: async (newPresets: ModelPresets) => {
      console.log('Sending presets data to server:', newPresets);
      
      // Format presets exactly as the backend schema expects (preset1, preset2, etc.)
      // The backend validation expects this format according to server/routes.ts
      const formattedPresets = {
        preset1: newPresets.preset1,
        preset2: newPresets.preset2,
        preset3: newPresets.preset3,
        preset4: newPresets.preset4,
        preset5: newPresets.preset5,
      };
      
      console.log('Formatted presets for API:', formattedPresets);
      const response = await apiRequest('PUT', '/api/user/presets', formattedPresets);
      
      console.log('Server response:', response);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/presets'] });
      toast({
        title: 'Preset Updated',
        description: 'Your model preset has been saved.',
      });
    },
    onError: (error) => {
      // Log the detailed error for debugging
      console.error('Error updating preset:', error);
      let errorMsg = 'Failed to update preset. Please try again.';
      
      // Try to extract more useful error information if available
      if (error instanceof Error) {
        errorMsg = error.message || errorMsg;
      } else if (typeof error === 'object' && error !== null) {
        errorMsg = JSON.stringify(error);
      }
      
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  });

  // Normalize model IDs to handle special model variants like ":thinking"
  const normalizeModelId = (modelId: string): string => {
    if (!modelId) return "";
    
    // Remove any thinking or special suffixes (for Claude models)
    return modelId.replace(/:thinking$/, '').trim();
  };

  // Format model name to display cleaner version
  const formatModelName = (modelId: string): string => {
    if (!modelId) return "";
    
    // First normalize the ID to remove any special suffixes
    const normalizedId = normalizeModelId(modelId);
    
    // Apply specific formatting rules for required models
    if (normalizedId.includes('openai/o3-mini-high')) {
      return 'o3 Mini H';
    } else if (normalizedId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (normalizedId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (normalizedId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (normalizedId.includes('google/gemini-2.5-pro')) {
      return 'Gemini 2.5 Pro'; // Added for new preset 1 default
    } else if (normalizedId.includes('google/gemini-2.0-flash-001')) {
      return 'Gemini 2.0 Flash';
    } else if (normalizedId === 'anthropic/claude-3-haiku') {
      return 'Claude 3 Haiku';
    } else if (normalizedId === 'anthropic/claude-3-opus') {
      return 'Claude 3 Opus';
    } else if (normalizedId.includes('x-ai/grok-2-1212')) {
      return 'Grok 2';
    } else if (normalizedId.includes('openai/gpt-4o')) {
      return 'GPT-4o';
    } else if (normalizedId.includes('openai/gpt-4.5-preview')) {
      return 'GPT-4.5';
    }
    
    // Generic formatting for other models
    const parts = normalizedId.split('/');
    if (parts.length > 1) {
      // Get the part after the provider
      let modelName = parts[1];
      // Replace hyphens with spaces
      modelName = modelName.replace(/-/g, ' ');
      // Capitalize first letter of each word
      return modelName.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return modelId; // If all else fails, return the ID
  };

  // Get model name by ID with improved formatting
  const getModelNameById = (modelId: string): string => {
    // First check if model exists in the fetched list
    const model = models.find(m => m.id === modelId);
    
    if (model) {
      return model.name;
    } else if (modelId) {
      // If model not in the list but we have an ID, format it
      return formatModelName(modelId);
    }
    
    return "Select Model"; // Default fallback
  };

  // Assign a model to a preset
  const assignModelToPreset = (presetKey: keyof ModelPresets, modelId: string) => {
    const updatedPresets = { ...presets, [presetKey]: modelId };
    setPresets(updatedPresets);
    mutate(updatedPresets);
  };

  // Activate a preset (set as active and return the modelId)
  const activatePreset = (presetKey: keyof ModelPresets): string | null => {
    const modelId = presets[presetKey];
    setActivePreset(presetKey);
    
    // We don't clear the activeFreeTierModel anymore to keep track of the last used free model
    // But we do visually deactivate it in the UI by setting activePreset
    
    return modelId;
  };

  // Activate a free tier model
  const activateFreeTierModel = (modelId: string): void => {
    setActiveFreeTierModel(modelId);
    setActivePreset(null); // Deactivate preset when free tier is activated
    
    // Store the free model ID in a cookie for persistence
    if (modelId) {
      setLastUsedFreeModel(modelId);
      cookieUtils.set(LAST_FREE_MODEL_COOKIE, modelId, { expires: 365 }); // Save for 1 year
      console.log(`Saved free model to cookie: ${modelId}`);
    }
  };

  const value = {
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
    normalizeModelId
  };

  return value;
};