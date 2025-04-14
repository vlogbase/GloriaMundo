import { ModelOption, ModelType } from "./types";

export const MODEL_OPTIONS: Record<ModelType, ModelOption> = {
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to various AI models through OpenRouter",
    apiName: "dynamic",
    apiProvider: "openrouter"
  }
};

// Legacy model mappings for backward compatibility
export const LEGACY_MODEL_MAPPINGS = {
  "reasoning": "anthropic/claude-3-opus",
  "search": "perplexity/sonar-pro",
  "multimodal": "openai/gpt-4o"
};

export const DEFAULT_MODEL: ModelType = "openrouter";