import { useEffect, useRef } from 'react';
import { useModelPresets } from '@/hooks/useModelPresets';
import { useModelSelection } from '@/hooks/useModelSelection';

/**
 * This component connects the free model selection logic to the model selection context
 * It ensures that a free model is automatically selected on initial load
 * and maintains the free model selection even when switching to/from paid models
 */
export const FreeModelInitializer: React.FC = () => {
  const { freeModels, activeFreeTierModel } = useModelPresets();
  const { selectedModel, customOpenRouterModelId, setSelectedModel, setCustomOpenRouterModelId } = useModelSelection();
  const hasSetInitialModel = useRef(false);
  const previousModelType = useRef<string | null>(null);

  // On mount and when free models or the active free tier model changes,
  // set the default model to the free model if it hasn't been set yet
  useEffect(() => {
    // Only set the default model if:
    // 1. We have free models
    // 2. We have an active free tier model (selected either automatically or by the user)
    // 3. We haven't already set the initial model
    if (freeModels.length > 0 && activeFreeTierModel && !hasSetInitialModel.current) {
      console.log(`Setting initial model to free model: ${activeFreeTierModel}`);
      
      // Set the OpenRouter model type
      setSelectedModel('openrouter');
      
      // Set the specific model ID
      setCustomOpenRouterModelId(activeFreeTierModel);
      
      // Mark that we've set the initial model to avoid doing it again
      hasSetInitialModel.current = true;
      previousModelType.current = 'openrouter';
    }
  }, [freeModels, activeFreeTierModel, setSelectedModel, setCustomOpenRouterModelId]);

  // Monitor selectedModel changes to handle transitions between free and paid models
  useEffect(() => {
    // If we're switching back to openrouter model type (likely from the free tier button)
    // and we have an active free tier model
    if (
      selectedModel === 'openrouter' && 
      previousModelType.current !== 'openrouter' && 
      activeFreeTierModel && 
      customOpenRouterModelId !== activeFreeTierModel
    ) {
      console.log(`Switching back to free model: ${activeFreeTierModel}`);
      setCustomOpenRouterModelId(activeFreeTierModel);
    }
    
    // Update previous model type for next comparison
    previousModelType.current = selectedModel;
  }, [selectedModel, activeFreeTierModel, customOpenRouterModelId, setCustomOpenRouterModelId]);

  // This component doesn't render anything
  return null;
};