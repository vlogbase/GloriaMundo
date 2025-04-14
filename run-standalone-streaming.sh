#!/bin/bash
echo "Starting GloriaMundo Standalone Streaming Server..."
echo "This server provides a working streaming implementation without dependencies"
echo "on the broken routes.ts file."
echo ""
echo "The server will start on port 5001. You can access the demo at:"
echo "http://localhost:5001/"
echo ""
echo "Press Ctrl+C to stop the server."
echo "======================================================"
exec npx tsx server/standalone-streaming.ts