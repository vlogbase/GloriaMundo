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

// Default empty presets
const defaultPresets: ModelPresets = {
  preset1: null,
  preset2: null,
  preset3: null,
  preset4: null,
  preset5: null
};

interface ModelPresetsContextType {
  presets: ModelPresets;
  isLoading: boolean;
  isPending: boolean;
  activePreset: string | null;
  assignModelToPreset: (presetKey: keyof ModelPresets, modelId: string) => void;
  activatePreset: (presetKey: keyof ModelPresets) => string | null;
  getModelNameById: (modelId: string) => string;
}

const ModelPresetsContext = createContext<ModelPresetsContextType | undefined>(undefined);

export const ModelPresetsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [presets, setPresets] = useState<ModelPresets>(defaultPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1 || null,
      preset2: data?.preset2 || null,
      preset3: data?.preset3 || null,
      preset4: data?.preset4 || null,
      preset5: data?.preset5 || null
    })
  });

  // Update presets state when data changes
  useEffect(() => {
    if (data) {
      setPresets(data);
    }
  }, [data]);

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
    return modelId;
  };

  // Get model name by ID
  const getModelNameById = (modelId: string): string => {
    const model = models.find(m => m.id === modelId);
    return model ? model.name : 'Unknown Model';
  };

  const value = {
    presets,
    isLoading,
    isPending,
    activePreset,
    assignModelToPreset,
    activatePreset,
    getModelNameById
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
  const { models } = useOpenRouterModels();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query to fetch user presets
  const { data, isLoading } = useQuery({
    queryKey: ['/api/user/presets'],
    select: (data: any) => ({
      preset1: data?.preset1 || null,
      preset2: data?.preset2 || null,
      preset3: data?.preset3 || null,
      preset4: data?.preset4 || null,
      preset5: data?.preset5 || null
    })
  });
  
  // Update presets state when data changes
  useEffect(() => {
    if (data) {
      setPresets(data);
    }
  }, [data]);

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
    return modelId;
  };

  // Get model name by ID
  const getModelNameById = (modelId: string): string => {
    const model = models.find(m => m.id === modelId);
    return model ? model.name : 'Unknown Model';
  };

  return {
    presets,
    isLoading,
    isPending,
    activePreset,
    assignModelToPreset,
    activatePreset,
    getModelNameById
  };
};