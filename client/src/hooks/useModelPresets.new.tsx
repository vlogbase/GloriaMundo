import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
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
}

// Default model presets with updated model IDs
const defaultPresets: ModelPresets = {
  preset1: 'openai/o3-mini',
  preset2: 'anthropic/claude-3.7-sonnet',
  preset3: 'deepseek/deepseek-r1',
  preset4: 'google/gemini-2.0-flash',
  preset5: 'perplexity/sonar-pro'
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
}

const ModelPresetsContext = createContext<ModelPresetsContextType | undefined>(undefined);

export const ModelPresetsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1 || defaultPresets.preset1,
      preset2: data?.preset2 || defaultPresets.preset2,
      preset3: data?.preset3 || defaultPresets.preset3,
      preset4: data?.preset4 || defaultPresets.preset4,
      preset5: data?.preset5 || defaultPresets.preset5
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

  // Mutation to update presets
  const { mutate, isPending } = useMutation({
    mutationFn: async (newPresets: ModelPresets) => {
      // Convert from camelCase to snake_case for API
      const apiPresets = {
        preset1_model_id: newPresets.preset1,
        preset2_model_id: newPresets.preset2,
        preset3_model_id: newPresets.preset3,
        preset4_model_id: newPresets.preset4,
        preset5_model_id: newPresets.preset5
      };
      
      return await apiRequest('PUT', '/api/user/presets', apiPresets);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/presets'] });
      toast({
        title: 'Preset Updated',
        description: 'Your model preset has been saved.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update preset. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating preset:', error);
    }
  });

  // Format model name to display cleaner version
  const formatModelName = (modelId: string): string => {
    if (!modelId) return "";
    
    // Apply specific formatting rules for required models
    if (modelId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (modelId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (modelId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (modelId.includes('google/gemini-2.0-flash')) {
      return 'Gemini 2.0 Flash';
    } else if (modelId.includes('perplexity/sonar-pro')) {
      return 'Sonar Pro';
    }
    
    // Generic formatting for other models
    const parts = modelId.split('/');
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
    formatModelName
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
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFreeTierModel, setActiveFreeTierModel] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1 || defaultPresets.preset1,
      preset2: data?.preset2 || defaultPresets.preset2,
      preset3: data?.preset3 || defaultPresets.preset3,
      preset4: data?.preset4 || defaultPresets.preset4,
      preset5: data?.preset5 || defaultPresets.preset5
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

  // Mutation to update presets
  const { mutate, isPending } = useMutation({
    mutationFn: async (newPresets: ModelPresets) => {
      // Convert from camelCase to snake_case for API
      const apiPresets = {
        preset1_model_id: newPresets.preset1,
        preset2_model_id: newPresets.preset2,
        preset3_model_id: newPresets.preset3,
        preset4_model_id: newPresets.preset4,
        preset5_model_id: newPresets.preset5
      };
      
      return await apiRequest('PUT', '/api/user/presets', apiPresets);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/presets'] });
      toast({
        title: 'Preset Updated',
        description: 'Your model preset has been saved.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update preset. Please try again.',
        variant: 'destructive',
      });
      console.error('Error updating preset:', error);
    }
  });

  // Format model name to display cleaner version
  const formatModelName = (modelId: string): string => {
    if (!modelId) return "";
    
    // Apply specific formatting rules for required models
    if (modelId.includes('openai/o3-mini')) {
      return 'o3 Mini';
    } else if (modelId.includes('anthropic/claude-3.7-sonnet')) {
      return 'Claude 3.7 Sonnet';
    } else if (modelId.includes('deepseek/deepseek-r1')) {
      return 'Deepseek R1';
    } else if (modelId.includes('google/gemini-2.0-flash')) {
      return 'Gemini 2.0 Flash';
    } else if (modelId.includes('perplexity/sonar-pro')) {
      return 'Sonar Pro';
    }
    
    // Generic formatting for other models
    const parts = modelId.split('/');
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
    formatModelName
  };
};