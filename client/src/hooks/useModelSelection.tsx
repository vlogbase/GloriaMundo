import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ModelType } from '@/lib/types';
import { DEFAULT_MODEL } from '@/lib/models';
import { cookieUtils } from '@/lib/utils';

interface ModelSelectionContextType {
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
}

const ModelSelectionContext = createContext<ModelSelectionContextType | undefined>(undefined);

const MODEL_SELECTION_COOKIE = 'gloriamodel';

export const ModelSelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(DEFAULT_MODEL);

  // Load saved preference from cookie on mount
  useEffect(() => {
    const savedModel = cookieUtils.get<ModelType>(MODEL_SELECTION_COOKIE);
    if (savedModel && ['reasoning', 'search', 'multimodal'].includes(savedModel)) {
      setSelectedModelState(savedModel);
    }
  }, []);

  const setSelectedModel = (model: ModelType) => {
    setSelectedModelState(model);
    cookieUtils.set(MODEL_SELECTION_COOKIE, model, { expires: 365 }); // Save preference for 1 year
  };

  return (
    <ModelSelectionContext.Provider value={{ selectedModel, setSelectedModel }}>
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