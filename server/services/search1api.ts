import axios from "axios";

if (!process.env.SEARCH1API_KEY) {
  throw new Error("Missing Search1API key");
}

const api = axios.create({
  baseURL: "https://api.search1api.com/v1",
  headers: {
    Authorization: `Bearer ${process.env.SEARCH1API_KEY}`,
    "Content-Type": "application/json",
  },
});

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatCompletionChoice {
  message: ChatMessage;
  finish_reason: string;
  index: number;
}

interface ChatCompletionResponse {
  id: string;
  choices: ChatCompletionChoice[];
  created: number;
}

export async function getChatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
  try {
    const response = await api.post<ChatCompletionResponse>("/chat/completions", {
      model: "deepseek-r1-70b-online",
      messages,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Search1API error: ${error.response?.data?.message || error.message}`);
    }
    throw error;
  }
}