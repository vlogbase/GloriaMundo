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

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setModels(data);
      // Set the first model as default if we have no selection yet
      if (!selectedModelId && data.length > 0) {
        setSelectedModelId(data[0].id);
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

  return {
    isLoading,
    models,
    selectedModelId,
    setSelectedModelId,
  };
};