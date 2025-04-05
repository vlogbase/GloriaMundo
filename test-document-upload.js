// Script to test document upload functionality
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDocumentUpload() {
  try {
    // Get sample data
    const filePath = path.join(__dirname, 'test/data/sample.txt');
    const stats = fs.statSync(filePath);
    console.log(`Test file size: ${stats.size} bytes`);
    
    // Create a new conversation
    const convResponse = await fetch('http://localhost:5000/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Document Test' }),
    });
    
    if (!convResponse.ok) {
      throw new Error(`Failed to create conversation: ${convResponse.status}`);
    }
    
    const conversation = await convResponse.json();
    console.log(`Created conversation with ID: ${conversation.id}`);
    
    // Upload document
    const form = new FormData();
    form.append('document', fs.createReadStream(filePath), {
      filename: 'sample.txt',
      contentType: 'text/plain',
    });
    
    const uploadResponse = await fetch(`http://localhost:5000/api/conversations/${conversation.id}/documents`, {
      method: 'POST',
      body: form,
    });
    
    console.log(`Upload response status: ${uploadResponse.status}`);
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${errorText}`);
    }
    
    const result = await uploadResponse.json();
    console.log('Upload result:', result);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testDocumentUpload();