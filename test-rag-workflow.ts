import { generateEmbedding, formatContextForPrompt } from './server/documentProcessor';

// This test verifies the key RAG workflow components without processing a full document
async function testRagWorkflow() {
  try {
    console.log('--- Testing RAG Workflow Components ---');
    
    // Test embedding generation
    console.log('\n1. Testing embedding generation...');
    const testText = 'This is a test for embedding generation in the RAG system.';
    const embedding = await generateEmbedding(testText);
    console.log('✓ Embedding generated successfully!');
    console.log(`Embedding length: ${embedding.length}`);
    
    // Test context formatting
    console.log('\n2. Testing context formatting...');
    const mockChunks = [
      {
        id: 1,
        documentId: 1,
        content: 'This is the first chunk of content from document 1.',
        chunkIndex: 0,
        embedding: JSON.stringify([0.1, 0.2, 0.3]),
        createdAt: new Date()
      },
      {
        id: 2,
        documentId: 1,
        content: 'This is the second chunk of content from document 1.',
        chunkIndex: 1,
        embedding: JSON.stringify([0.2, 0.3, 0.4]),
        createdAt: new Date()
      },
      {
        id: 3,
        documentId: 2,
        content: 'This is content from document 2.',
        chunkIndex: 0,
        embedding: JSON.stringify([0.3, 0.4, 0.5]),
        createdAt: new Date()
      }
    ];
    
    const mockDocuments = {
      1: {
        id: 1,
        conversationId: 1,
        userId: 1,
        fileName: 'test-doc-1.txt',
        fileType: 'text/plain',
        fileSize: 1000,
        content: 'Full content of document 1',
        metadata: null,
        createdAt: new Date()
      },
      2: {
        id: 2,
        conversationId: 1,
        userId: 1,
        fileName: 'test-doc-2.txt',
        fileType: 'text/plain',
        fileSize: 500,
        content: 'Full content of document 2',
        metadata: null,
        createdAt: new Date()
      }
    };
    
    const formattedContext = formatContextForPrompt(mockChunks, mockDocuments);
    console.log('✓ Context formatted successfully!');
    console.log('Formatted context:\n', formattedContext);
    
    console.log('\nRAG workflow components are functional!');
  } catch (error) {
    console.error('Error in RAG workflow test:', error);
  }
}

testRagWorkflow();