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
    description: "Provides up-to-date information with search capabilities (Sonar-small)",
    apiName: "llama-3.1-sonar-small-128k-online",
    apiProvider: "perplexity"
  },
  multimodal: {
    id: "multimodal",
    name: "Multimodal",
    description: "Advanced model with versatile capabilities (Llama 3.3 Versatile)",
    apiName: "llama-3.3-70b-versatile",
    apiProvider: "groq"
  }
};

export const DEFAULT_MODEL: ModelType = "reasoning";