import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ModelType } from '@/lib/types';
import { DEFAULT_MODEL, LEGACY_MODEL_MAPPINGS } from '@/lib/models';
import { cookieUtils } from '@/lib/utils';

interface ModelSelectionContextType {
  selectedModel: ModelType; // This will always be 'openrouter' now
  setSelectedModel: (model: ModelType) => void;
  customOpenRouterModelId: string | null;
  setCustomOpenRouterModelId: (modelId: string | null) => void;
}

const ModelSelectionContext = createContext<ModelSelectionContextType | undefined>(undefined);

const MODEL_SELECTION_COOKIE = 'gloriamodel';
const OPENROUTER_MODEL_COOKIE = 'openroutermodel';

export const ModelSelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(DEFAULT_MODEL);
  const [customOpenRouterModelId, setCustomOpenRouterModelIdState] = useState<string | null>(null);

  // Load saved preferences from cookies on mount
  useEffect(() => {
    // Handle legacy model types for backward compatibility
    const savedModel = cookieUtils.get<string>(MODEL_SELECTION_COOKIE);
    
    if (savedModel) {
      // Map legacy model types to their OpenRouter equivalents
      if (['reasoning', 'search', 'multimodal'].includes(savedModel)) {
        // Get the mapped model ID for legacy model type
        const mappedModelId = LEGACY_MODEL_MAPPINGS[savedModel as keyof typeof LEGACY_MODEL_MAPPINGS];
        
        // Set the direct OpenRouter model ID instead of the legacy model type
        setCustomOpenRouterModelIdState(mappedModelId);
        cookieUtils.set(OPENROUTER_MODEL_COOKIE, mappedModelId, { expires: 365 });
        
        // Always use 'openrouter' as the model type
        setSelectedModelState('openrouter');
        cookieUtils.set(MODEL_SELECTION_COOKIE, 'openrouter', { expires: 365 });
        
        console.log(`Migrated legacy model type ${savedModel} to OpenRouter model ID ${mappedModelId}`);
      } else if (savedModel === 'openrouter') {
        setSelectedModelState('openrouter');
      }
    }
    
    // Load custom OpenRouter model ID if there is one
    const savedOpenRouterModelId = cookieUtils.get<string>(OPENROUTER_MODEL_COOKIE);
    if (savedOpenRouterModelId) {
      setCustomOpenRouterModelIdState(savedOpenRouterModelId);
    }
  }, []);

  const setSelectedModel = (model: ModelType) => {
    // Only 'openrouter' is valid now
    setSelectedModelState('openrouter');
    cookieUtils.set(MODEL_SELECTION_COOKIE, 'openrouter', { expires: 365 }); // Save preference for 1 year
  };
  
  const setCustomOpenRouterModelId = (modelId: string | null) => {
    console.log(`Setting custom OpenRouter model ID to: ${modelId}`);
    setCustomOpenRouterModelIdState(modelId);
    
    // When setting a custom model ID, ensure model type is set to openrouter (always true now)
    if (modelId) {
      cookieUtils.set(OPENROUTER_MODEL_COOKIE, modelId, { expires: 365 }); // Save preference for 1 year
    } else {
      cookieUtils.remove(OPENROUTER_MODEL_COOKIE);
    }
  };

  return (
    <ModelSelectionContext.Provider value={{ 
      selectedModel, 
      setSelectedModel,
      customOpenRouterModelId,
      setCustomOpenRouterModelId 
    }}>
      {children}
    </ModelSelectionContext.Provider>
  );
};

export const useModelSelection = (): ModelSelectionContextType => {
  const context = useContext(ModelSelectionContext);
  if (context === undefined) {
    throw new Error('useModelSelection must be used within a ModelSelectionProvider');
  }
  return context;
};