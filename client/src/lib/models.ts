import { ModelOption, ModelType } from "./types";

export const MODEL_OPTIONS: Record<ModelType, ModelOption> = {
  reasoning: {
    id: "reasoning",
    name: "Reasoning",
    description: "Optimized for thoughtful analysis and deep reasoning",
    apiName: "perplexity/sonar-reasoning-pro",
    apiProvider: "openrouter"
  },
  search: {
    id: "search",
    name: "Search",
    description: "Provides up-to-date information with search capabilities",
    apiName: "perplexity/sonar-pro",
    apiProvider: "openrouter"
  },
  multimodal: {
    id: "multimodal",
    name: "Multimodal",
    description: "Vision capabilities for analyzing images and text",
    apiName: "openai/gpt-4o",
    apiProvider: "openrouter"
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to various AI models through OpenRouter",
    apiName: "dynamic",
    apiProvider: "openrouter"
  }
};

export const DEFAULT_MODEL: ModelType = "openrouter";