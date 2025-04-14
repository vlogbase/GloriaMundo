#!/bin/bash
echo "Starting GloriaMundo Streaming Demo Server..."
echo "This server bypasses the broken routes.ts file and"
echo "provides a working streaming implementation."
echo ""
echo "The server will start on port 5000. You can access it in your browser."
echo ""
echo "Press Ctrl+C to stop the server."
echo "======================================================"
exec npx tsx server/minimal-index.ts