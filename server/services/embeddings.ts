import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { supabase } from "./supabase";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OpenAI API key");
}

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string) {
  try {
    return await embeddings.embedQuery(text);
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error("Failed to generate embedding");
  }
}

export async function findSimilarMessages(text: string, chatId: number, limit = 5) {
  try {
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabase,
      tableName: "messages",
      queryName: "match_messages",
      filter: (rpc) => rpc.eq('chat_id', chatId)
    });

    const results = await vectorStore.similaritySearch(text, limit);
    return results.map(doc => ({
      content: doc.pageContent,
      role: doc.metadata?.role || "user"
    }));
  } catch (error) {
    console.error("Error finding similar messages:", error);
    return []; // Return empty array on error to allow graceful degradation
  }
}