import { generateEmbedding } from './server/documentProcessor';

async function testEmbedding() {
  try {
    console.log('Testing embedding generation...');
    const embedding = await generateEmbedding('This is a test document for embedding generation.');
    console.log('Embedding generated successfully!');
    console.log(`Embedding length: ${embedding.length}`);
    console.log('First few characters:', embedding.substring(0, 50) + '...');
  } catch (error) {
    console.error('Error generating embedding:', error);
  }
}

testEmbedding();