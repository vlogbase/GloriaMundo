// Try importing the Azure OpenAI package dynamically
import('@azure/openai').then(module => {
  console.log('Module is an object:', typeof module === 'object');
  console.log('Module is a function:', typeof module === 'function');
  console.log('Available exports:', Object.keys(module));
  console.log('Module default export available:', typeof module.default === 'function' || typeof module.default === 'object');
  if (module.default) {
    console.log('Default export keys:', Object.keys(module.default));
  }
}).catch(error => {
  console.error('Error importing @azure/openai:', error);
});