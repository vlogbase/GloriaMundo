// Import the required Azure OpenAI SDK modules
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

// Define Azure OpenAI configurations
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;

async function main() {
  console.log("=== Azure OpenAI Client Test ===");
  console.log("Endpoint:", endpoint);
  console.log("API Key available:", !!apiKey);

  // Create the client
  const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
  console.log("Client created successfully!");
  
  // List deployments
  console.log("\nListing deployments:");
  const deployments = await client.listDeployments();
  for await (const deployment of deployments) {
    console.log(`- ${deployment.name} (${deployment.model})`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
});