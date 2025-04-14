export interface User {
  id: number;
  username: string;
}

export interface Conversation {
  id: number;
  userId: number | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string; // Base64 encoded image data
  citations: string[] | null;
  modelId?: string; // The model used for this message
  promptTokens?: number; // Number of tokens in the prompt
  completionTokens?: number; // Number of tokens in the completion
  createdAt: string;
}

export type ModelType = "reasoning" | "search" | "multimodal" | "openrouter";

export interface ModelOption {
  id: ModelType | string;
  name: string;
  description: string;
  apiName: string;
  apiProvider: "openrouter";
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    request?: number;
  };
  isFree?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
