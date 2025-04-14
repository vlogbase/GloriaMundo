import { createServer } from 'http';
import express from 'express';

const app = express();

app.get('/stream', (req, res) => {
  // Set headers for server-sent events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send a heartbeat immediately
  res.write('event: heartbeat\ndata: {}\n\n');
  
  // Create a sequence of messages to stream
  const messages = [
    "Hello, ",
    "this ",
    "is ",
    "a ",
    "streaming ",
    "response ",
    "being ",
    "sent ",
    "character ",
    "by ",
    "character."
  ];
  
  let index = 0;
  
  // Send each message with a delay to simulate streaming
  const interval = setInterval(() => {
    if (index < messages.length) {
      const chunk = messages[index];
      console.log(`Sending chunk: ${chunk}`);
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      index++;
    } else {
      clearInterval(interval);
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  }, 300);
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => {
  res.sendFile(new URL('./test-streaming.html', import.meta.url).pathname);
});

// Create basic HTML page for testing
import { writeFileSync } from 'fs';
writeFileSync('test-streaming.html', `
<!DOCTYPE html>
<html>
<head>
  <title>Streaming Test</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    #output { border: 1px solid #ccc; padding: 10px; min-height: 200px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Streaming Test</h1>
  <button id="startBtn">Start Stream</button>
  <div id="output"></div>

  <script>
    const output = document.getElementById('output');
    const startBtn = document.getElementById('startBtn');
    let eventSource;

    startBtn.addEventListener('click', () => {
      // Clear previous output
      output.textContent = '';
      
      // Close existing connection if any
      if (eventSource) {
        eventSource.close();
      }
      
      // Create new EventSource connection
      eventSource = new EventSource('/stream');
      
      // Handle incoming messages
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        output.textContent += data.text;
      };
      
      // Handle heartbeat
      eventSource.addEventListener('heartbeat', () => {
        console.log('Received heartbeat');
      });
      
      // Handle done event
      eventSource.addEventListener('done', () => {
        console.log('Stream complete');
        eventSource.close();
      });
      
      // Handle errors
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        output.innerHTML += '<br><b>Error: Connection lost</b>';
        eventSource.close();
      };
    });
  </script>
</body>
</html>
`);

// Start the server
const PORT = 3001;
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`Streaming test server running at http://localhost:${PORT}`);
});