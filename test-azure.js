// Import the required OpenAI SDK modules
import { AzureOpenAI } from "openai";
import "@azure/openai/types";

// Define Azure OpenAI configurations
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

async function main() {
  console.log("=== Azure OpenAI Client Test ===");
  console.log("Endpoint:", endpoint);
  console.log("API Key available:", !!apiKey);
  console.log("Deployment Name:", deploymentName);

  try {
    // Create the client
    const azureOpenAI = new AzureOpenAI({
      apiKey: apiKey,
      endpoint: endpoint,
      deployment: deploymentName,
      apiVersion: "2023-12-01-preview"
    });
    console.log("Client created successfully!");
    
    // Test embeddings
    console.log("\nTesting embeddings:");
    const embeddingResponse = await azureOpenAI.embeddings.create({
      input: "Hello, world!",
      model: deploymentName
    });
    
    console.log(`Embedding generated with dimensions: ${embeddingResponse.data[0].embedding.length}`);
    // Only show first few values of the embedding vector
    console.log(`Sample values: [${embeddingResponse.data[0].embedding.slice(0, 5).join(', ')}...]`);
  } catch (error) {
    console.error("Error occurred:", error);
    
    if (error.response) {
      console.error("Response error:", {
        status: error.response.status,
        headers: error.response.headers,
        data: error.response.data
      });
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
});