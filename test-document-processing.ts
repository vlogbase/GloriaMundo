import { processDocument } from './server/documentProcessor';
import { readFile } from 'fs/promises';
import path from 'path';

async function testDocumentProcessing() {
  try {
    console.log('Reading test text file...');
    // Use a text file from the test directory
    const filePath = path.join(process.cwd(), 'test', 'data', 'sample.txt');
    const buffer = await readFile(filePath);
    
    console.log(`File loaded: ${filePath}, size: ${buffer.length} bytes`);
    
    console.log('Processing document...');
    const result = await processDocument({
      buffer,
      fileName: 'sample.txt',
      fileType: 'text/plain',
      fileSize: buffer.length,
      conversationId: 1, // Test conversation ID
      userId: 1, // Test user ID
    });
    
    console.log('Document processed successfully!');
    console.log('Document ID:', result.id);
    console.log('Content length:', result.content.length);
    console.log('First 100 characters of content:', result.content.substring(0, 100) + '...');
    
  } catch (error) {
    console.error('Error processing document:', error);
  }
}

testDocumentProcessing();