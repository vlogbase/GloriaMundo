import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ModelType } from '@/lib/types';
import { DEFAULT_MODEL } from '@/lib/models';
import { cookieUtils } from '@/lib/utils';

interface ModelSelectionContextType {
  selectedModel: ModelType;
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
    // Load selected model type
    const savedModel = cookieUtils.get<ModelType>(MODEL_SELECTION_COOKIE);
    if (savedModel && ['reasoning', 'search', 'multimodal', 'openrouter'].includes(savedModel)) {
      setSelectedModelState(savedModel);
    }
    
    // Load custom OpenRouter model ID if there is one
    const savedOpenRouterModelId = cookieUtils.get<string>(OPENROUTER_MODEL_COOKIE);
    if (savedOpenRouterModelId) {
      setCustomOpenRouterModelIdState(savedOpenRouterModelId);
    }
  }, []);

  const setSelectedModel = (model: ModelType) => {
    setSelectedModelState(model);
    cookieUtils.set(MODEL_SELECTION_COOKIE, model, { expires: 365 }); // Save preference for 1 year
  };
  
  const setCustomOpenRouterModelId = (modelId: string | null) => {
    console.log(`Setting custom OpenRouter model ID to: ${modelId}`);
    setCustomOpenRouterModelIdState(modelId);
    
    // When setting a custom model ID, we should also ensure the model type is set to openrouter
    if (modelId && selectedModel !== 'openrouter') {
      setSelectedModelState('openrouter');
      cookieUtils.set(MODEL_SELECTION_COOKIE, 'openrouter', { expires: 365 });
      console.log('Automatically setting selected model to openrouter');
    }
    
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