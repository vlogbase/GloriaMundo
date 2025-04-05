// Try importing the OpenAI package for Azure dynamically
import('openai').then((openaiModule) => {
  console.log('OpenAI module is an object:', typeof openaiModule === 'object');
  console.log('Available exports in OpenAI module:', Object.keys(openaiModule));
  
  if (openaiModule.AzureOpenAI) {
    console.log('AzureOpenAI class is available');
  } else {
    console.log('Warning: AzureOpenAI class is not available in openai module');
  }
  
  // Check if environment variables are set
  console.log('\nEnvironment variables:');
  console.log('AZURE_OPENAI_ENDPOINT set:', !!process.env.AZURE_OPENAI_ENDPOINT);
  console.log('AZURE_OPENAI_KEY set:', !!process.env.AZURE_OPENAI_KEY);
  console.log('AZURE_OPENAI_DEPLOYMENT_NAME set:', !!process.env.AZURE_OPENAI_DEPLOYMENT_NAME);
}).catch(error => {
  console.error('Error importing modules:', error);
});