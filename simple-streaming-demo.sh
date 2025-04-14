#!/bin/bash
echo "Starting GloriaMundo Simple Streaming Demo Server..."
echo "This server provides a clean, working streaming implementation."
echo ""
echo "The server will start on port 5001. You can access the demo at:"
echo "http://localhost:5001/"
echo ""
echo "Press Ctrl+C to stop the server."
echo "======================================================"
exec npx tsx server/simple-streaming.ts