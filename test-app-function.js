// Simple script to test if the application is running
import http from 'http';

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response received successfully');
    if (data.includes('Error')) {
      console.log('ERROR DETECTED IN RESPONSE:');
      
      // Extract error details
      const errorStart = data.indexOf('Error:');
      if (errorStart > -1) {
        const errorEnd = data.indexOf('</pre>', errorStart);
        if (errorEnd > -1) {
          console.log(data.substring(errorStart, errorEnd));
        }
      }
    } else {
      console.log('No errors detected in response');
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();