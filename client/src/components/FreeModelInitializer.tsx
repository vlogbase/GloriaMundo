import { useEffect, useRef } from 'react';
import { useModelPresets } from '@/hooks/useModelPresets';
import { useModelSelection } from '@/hooks/useModelSelection';

/**
 * This component connects the free model selection logic to the model selection context
 * It ensures that a free model is automatically selected on initial load
 * and maintains the free model selection only when explicitly using the free tier button
 */
export const FreeModelInitializer: React.FC = () => {
  const { freeModels, activeFreeTierModel, activePreset } = useModelPresets();
  const { selectedModel, customOpenRouterModelId, setSelectedModel, setCustomOpenRouterModelId } = useModelSelection();
  const hasSetInitialModel = useRef(false);
  const previousModelType = useRef<string | null>(null);
  const isFreeTierExplicitlySelected = useRef(false);

  // On mount and when free models or the active free tier model changes,
  // set the default model to the free model if it hasn't been set yet
  useEffect(() => {
    // Only set the default model if:
    // 1. We have free models
    // 2. We have an active free tier model (selected either automatically or by the user)
    // 3. We haven't already set the initial model
    // 4. No specific preset is active
    if (freeModels.length > 0 && activeFreeTierModel && !hasSetInitialModel.current && !activePreset) {
      console.log(`Setting initial model to free model: ${activeFreeTierModel}`);
      
      // Set the OpenRouter model type
      setSelectedModel('openrouter');
      
      // Set the specific model ID
      setCustomOpenRouterModelId(activeFreeTierModel);
      
      // Mark that we've set the initial model to avoid doing it again
      hasSetInitialModel.current = true;
      previousModelType.current = 'openrouter';
    }
  }, [freeModels, activeFreeTierModel, activePreset, setSelectedModel, setCustomOpenRouterModelId]);

  // Monitor selectedModel changes to handle transitions between free and paid models
  useEffect(() => {
    // If we're switching back to openrouter model type AND a preset is not active
    // (this handles the case where the free tier button was explicitly clicked)
    // and we have an active free tier model
    if (
      selectedModel === 'openrouter' && 
      previousModelType.current !== 'openrouter' && 
      activeFreeTierModel && 
      customOpenRouterModelId !== activeFreeTierModel &&
      !activePreset &&  // Don't override a preset selection
      isFreeTierExplicitlySelected.current  // Only apply when free tier is explicitly selected
    ) {
      console.log(`Switching back to free model: ${activeFreeTierModel}`);
      setCustomOpenRouterModelId(activeFreeTierModel);
    }
    
    // Track if we explicitly selected the free tier
    // This happens when we switch to 'openrouter' type with no active preset
    if (selectedModel === 'openrouter' && !activePreset) {
      isFreeTierExplicitlySelected.current = true;
    } else if (activePreset) {
      // When a preset is active, we're not using the free tier button
      isFreeTierExplicitlySelected.current = false;
    }
    
    // Update previous model type for next comparison
    previousModelType.current = selectedModel;
  }, [selectedModel, activeFreeTierModel, activePreset, customOpenRouterModelId, setCustomOpenRouterModelId]);

  // This component doesn't render anything
  return null;
};