import { ModelOption, ModelType } from "./types";

export const MODEL_OPTIONS: Record<ModelType, ModelOption> = {
  reasoning: {
    id: "reasoning",
    name: "Reasoning",
    description: "Optimized for thoughtful analysis and deep reasoning (Deepseek-r1)",
    apiName: "deepseek-r1-distill-llama-70b",
    apiProvider: "groq"
  },
  search: {
    id: "search",
    name: "Search",
    description: "Provides up-to-date information with search capabilities (Sonar)",
    apiName: "sonar-reasoning",
    apiProvider: "perplexity"
  },
  multimodal: {
    id: "multimodal",
    name: "Multimodal",
    description: "Vision capabilities for analyzing images and text (Llama 3.2 Vision)",
    apiName: "llama-3.2-90b-vision-preview",
    apiProvider: "groq"
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to various AI models through OpenRouter",
    apiName: "dynamic",
    apiProvider: "openrouter"
  }
};

export const DEFAULT_MODEL: ModelType = "reasoning";