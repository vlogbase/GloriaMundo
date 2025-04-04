import { useState, useEffect } from 'react';
import { OpenRouterModel } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

export const useOpenRouterModels = () => {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch models from OpenRouter API
  const { data, isError, isLoading } = useQuery<OpenRouterModel[]>({
    queryKey: ['/api/openrouter/models'],
    enabled: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Process the model data
  useEffect(() => {
    if (data && Array.isArray(data)) {
      // Process models - ensure free models are correctly identified
      const processedModels = data.map(model => {
        // A model is free if all pricing properties are either 0, null, or undefined
        const promptCost = model.pricing?.prompt;
        const completionCost = model.pricing?.completion;
        const requestCost = model.pricing?.request;
        
        const isPromptFree = promptCost === 0 || promptCost === null || promptCost === undefined || 
                            (typeof promptCost === 'string' && parseFloat(promptCost) === 0);
        const isCompletionFree = completionCost === 0 || completionCost === null || completionCost === undefined || 
                                (typeof completionCost === 'string' && parseFloat(completionCost) === 0);
        const isRequestFree = requestCost === 0 || requestCost === null || requestCost === undefined || 
                            (typeof requestCost === 'string' && parseFloat(requestCost) === 0);
        
        const isFree = isPromptFree && isCompletionFree && isRequestFree;
        
        return {
          ...model,
          isFree
        };
      });
      
      // Sort models: show free models first, then alphabetically by provider
      const sortedModels = processedModels.sort((a, b) => {
        // First by free status (free models first)
        if (a.isFree && !b.isFree) return -1;
        if (!a.isFree && b.isFree) return 1;
        
        // Then by provider name
        const providerA = a.id.split('/')[0] || '';
        const providerB = b.id.split('/')[0] || '';
        if (providerA !== providerB) return providerA.localeCompare(providerB);
        
        // Then by model name
        return a.name.localeCompare(b.name);
      });
      
      setModels(sortedModels);
      
      // Set the first model as default if we have no selection yet
      if (!selectedModelId && sortedModels.length > 0) {
        setSelectedModelId(sortedModels[0].id);
      }
    }
  }, [data, selectedModelId]);

  useEffect(() => {
    if (isError) {
      toast({
        variant: 'destructive',
        title: 'Error fetching models',
        description: 'Could not load OpenRouter models. Check API key configuration.',
      });
    }
  }, [isError, toast]);

  // Get a specifically formatted name for a model
  const getFormattedModelName = (modelId: string): string => {
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

  return {
    isLoading,
    models,
    selectedModelId,
    setSelectedModelId,
    getFormattedModelName
  };
};