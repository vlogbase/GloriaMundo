import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOpenRouterModels } from './useOpenRouterModels';
import { useToast } from './use-toast';

// Define the ModelPresets type
export interface ModelPresets {
  preset1: string | null;
  preset2: string | null;
  preset3: string | null;
  preset4: string | null;
  preset5: string | null;
  preset6: string | null; // Added preset6 for the FREE tier
}

// Priority order for free models in preset6
const FREE_TIER_PRIORITY = [
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwq-32b:free',
  'deepseek/deepseek-r1-distill-qwen-32b:free',
  'deepseek/deepseek-r1-distill-llama-70b:free',
  'nvidia/llama-3.1-nemotron-nano-8b-v1:free',
  'openrouter/optimus-alpha'
];

// Default model presets with verified valid model IDs from OpenRouter
const defaultPresets: ModelPresets = {
  preset1: 'google/gemini-2.5-pro-exp-03-25:free', // Changed from GPT-4.5 to Gemini 2.5 Pro (free version)
  preset2: 'anthropic/claude-3.7-sonnet',          // All models preset 2
  preset3: 'openai/o3-mini-high',                  // Reasoning preset
  preset4: 'openai/gpt-4o',                        // Multimodal preset
  preset5: 'perplexity/sonar-pro',                 // Search preset
  preset6: 'google/gemini-2.0-flash-exp:free'      // FREE preset - default to first priority model
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
  initializeFreeTierPreset: () => void;
}

const ModelPresetsContext = createContext<ModelPresetsContextType | undefined>(undefined);

export const ModelPresetsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Use a ref to prevent initialization infinite loop
  const initializedRef = useRef(false);

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1ModelId || defaultPresets.preset1,
      preset2: data?.preset2ModelId || defaultPresets.preset2,
      preset3: data?.preset3ModelId || defaultPresets.preset3,
      preset4: data?.preset4ModelId || defaultPresets.preset4,
      preset5: data?.preset5ModelId || defaultPresets.preset5,
      preset6: data?.preset6ModelId || defaultPresets.preset6
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

  // Initialize preset6 with the highest priority free model available
  const initializeFreeTierPreset = () => {
    if (freeModels.length === 0) return; // No free models available yet
    
    // Don't initialize if we already have a preset6 value
    if (presets.preset6) {
      // Check if it's a valid model
      const modelExists = freeModels.some(model => model.id === presets.preset6);
      if (modelExists) return; // Keep existing preset6 if valid
    }
    
    // Check for each priority model if it's available
    for (const priorityModelId of FREE_TIER_PRIORITY) {
      const modelExists = freeModels.some(model => model.id === priorityModelId);
      if (modelExists) {
        // Priority model is available, set it as preset6
        const updatedPresets = { ...presets, preset6: priorityModelId };
        setPresets(updatedPresets);
        mutate(updatedPresets);
        console.log(`Preset 6 (FREE) initialized with priority model: ${priorityModelId}`);
        return;
      }
    }
    
    // None of the priority models available, use a random free model
    const randomFreeModel = freeModels[Math.floor(Math.random() * freeModels.length)];
    const updatedPresets = { ...presets, preset6: randomFreeModel.id };
    setPresets(updatedPresets);
    mutate(updatedPresets);
    console.log(`Preset 6 (FREE) initialized with random free model: ${randomFreeModel.id}`);
  };

  // Initialize FREE tier preset when free models are available
  useEffect(() => {
    if (freeModels.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      initializeFreeTierPreset();
    }
  }, [freeModels]);

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
        preset6: newPresets.preset6
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
    if (normalizedId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (normalizedId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (normalizedId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (normalizedId.includes('google/gemini-2.5-pro')) {
      return 'Gemini 2.5 Pro'; // Added for new preset 1 default
    } else if (normalizedId.includes('google/gemini-2.0-flash')) {
      return 'Gemini 2.0 Flash';
    } else if (normalizedId === 'perplexity/sonar-pro') {
      return 'Sonar Pro';
    } else if (normalizedId === 'perplexity/sonar-reasoning-pro') {
      return 'Sonar Reasoning';
    } else if (normalizedId.includes('x-ai/grok-2-1212')) {
      return 'Grok 2';
    } else if (normalizedId.includes('openai/gpt-4o')) {
      return 'GPT-4o';
    } else if (normalizedId.includes('openai/gpt-4.5-preview')) {
      return 'GPT-4.5';
    } else if (normalizedId.includes('qwen/qwq-32b')) {
      return 'Qwen QWQ 32B';
    } else if (normalizedId.includes('nvidia/llama-3.1-nemotron-nano-8b')) {
      return 'Llama 3.1 Nano 8B';
    } else if (normalizedId.includes('openrouter/optimus-alpha')) {
      return 'Optimus Alpha';
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
    setActiveFreeTierModel(null); // Deactivate free tier when preset is activated
    return modelId;
  };

  // Activate a free tier model
  const activateFreeTierModel = (modelId: string): void => {
    setActiveFreeTierModel(modelId);
    setActivePreset(null); // Deactivate preset when free tier is activated
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
    normalizeModelId,
    initializeFreeTierPreset
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
  // Note: This uses the same defaultPresets from above, which has been updated to include preset6
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Use a ref to prevent initialization infinite loop
  const initializedRef = useRef(false);

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1ModelId || defaultPresets.preset1,
      preset2: data?.preset2ModelId || defaultPresets.preset2,
      preset3: data?.preset3ModelId || defaultPresets.preset3,
      preset4: data?.preset4ModelId || defaultPresets.preset4,
      preset5: data?.preset5ModelId || defaultPresets.preset5,
      preset6: data?.preset6ModelId || defaultPresets.preset6
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

  // Initialize preset6 with the highest priority free model available
  const initializeFreeTierPreset = () => {
    if (freeModels.length === 0) return; // No free models available yet
    
    // Don't initialize if we already have a preset6 value
    if (presets.preset6) {
      // Check if it's a valid model
      const modelExists = freeModels.some(model => model.id === presets.preset6);
      if (modelExists) return; // Keep existing preset6 if valid
    }
    
    // Check for each priority model if it's available
    for (const priorityModelId of FREE_TIER_PRIORITY) {
      const modelExists = freeModels.some(model => model.id === priorityModelId);
      if (modelExists) {
        // Priority model is available, set it as preset6
        const updatedPresets = { ...presets, preset6: priorityModelId };
        setPresets(updatedPresets);
        mutate(updatedPresets);
        console.log(`Preset 6 (FREE) initialized with priority model: ${priorityModelId}`);
        return;
      }
    }
    
    // None of the priority models available, use a random free model
    const randomFreeModel = freeModels[Math.floor(Math.random() * freeModels.length)];
    const updatedPresets = { ...presets, preset6: randomFreeModel.id };
    setPresets(updatedPresets);
    mutate(updatedPresets);
    console.log(`Preset 6 (FREE) initialized with random free model: ${randomFreeModel.id}`);
  };

  // Initialize FREE tier preset when free models are available
  useEffect(() => {
    if (freeModels.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      initializeFreeTierPreset();
    }
  }, [freeModels]);

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
        preset6: newPresets.preset6
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
    if (normalizedId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (normalizedId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (normalizedId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (normalizedId.includes('google/gemini-2.5-pro')) {
      return 'Gemini 2.5 Pro'; // Added for new preset 1 default
    } else if (normalizedId.includes('google/gemini-2.0-flash')) {
      return 'Gemini 2.0 Flash';
    } else if (normalizedId === 'perplexity/sonar-pro') {
      return 'Sonar Pro';
    } else if (normalizedId === 'perplexity/sonar-reasoning-pro') {
      return 'Sonar Reasoning';
    } else if (normalizedId.includes('x-ai/grok-2-1212')) {
      return 'Grok 2';
    } else if (normalizedId.includes('openai/gpt-4o')) {
      return 'GPT-4o';
    } else if (normalizedId.includes('openai/gpt-4.5-preview')) {
      return 'GPT-4.5';
    } else if (normalizedId.includes('qwen/qwq-32b')) {
      return 'Qwen QWQ 32B';
    } else if (normalizedId.includes('nvidia/llama-3.1-nemotron-nano-8b')) {
      return 'Llama 3.1 Nano 8B';
    } else if (normalizedId.includes('openrouter/optimus-alpha')) {
      return 'Optimus Alpha';
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
    setActiveFreeTierModel(null); // Deactivate free tier when preset is activated
    return modelId;
  };

  // Activate a free tier model
  const activateFreeTierModel = (modelId: string): void => {
    setActiveFreeTierModel(modelId);
    setActivePreset(null); // Deactivate preset when free tier is activated
  };

  return {
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
    normalizeModelId,
    initializeFreeTierPreset
  };
};