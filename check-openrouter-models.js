// Script to check available OpenRouter models
import https from 'https';
import { env } from 'process';

const apiKey = env.OPENROUTER_API_KEY;

// Check if API key is available
if (!apiKey) {
  console.error('OPENROUTER_API_KEY environment variable not set');
  process.exit(1);
}

const options = {
  hostname: 'openrouter.ai',
  path: '/api/v1/models',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`Error: ${res.statusCode} ${data}`);
      return;
    }

    try {
      const models = JSON.parse(data).data;
      
      console.log('=== OpenAI GPT 4.5 Models ===');
      const gpt45Models = models.filter(model => 
        model.id.includes('openai/gpt-4.5') || 
        model.name.toLowerCase().includes('gpt-4.5')
      );
      
      if (gpt45Models.length > 0) {
        gpt45Models.forEach(model => {
          console.log(`ID: ${model.id}`);
          console.log(`Name: ${model.name}`);
          console.log(`Context length: ${model.context_length}`);
          console.log(`Pricing: ${JSON.stringify(model.pricing)}`);
          console.log('---');
        });
      } else {
        console.log('No GPT-4.5 models found');
      }
      
      console.log('\n=== All OpenAI Models ===');
      const openaiModels = models.filter(model => model.id.startsWith('openai/'));
      openaiModels.forEach(model => {
        console.log(`ID: ${model.id}`);
        console.log(`Name: ${model.name}`);
        console.log('---');
      });
      
      console.log('\n=== All Anthropic Models ===');
      const anthropicModels = models.filter(model => model.id.startsWith('anthropic/'));
      anthropicModels.forEach(model => {
        console.log(`ID: ${model.id}`);
        console.log(`Name: ${model.name}`);
        console.log('---');
      });
      
    } catch (error) {
      console.error('Error parsing response:', error);
    }
  });
});

req.on('error', (error) => {
  console.error('Error making request:', error);
});

req.end();