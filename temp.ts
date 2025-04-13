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
    } else if (normalizedId.includes('google/gemini-2.0-flash-001')) {
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

