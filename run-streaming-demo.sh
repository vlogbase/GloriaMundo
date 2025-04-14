#!/bin/bash
# This script starts the streaming demo server and launches the frontend
echo "Starting GloriaMundo streaming demo..."

# Set port for the streaming server
export PORT=3000

# Start the streaming server in the background
echo "Starting streaming server on port $PORT..."
npx tsx server/simpler-index.ts &
STREAMING_PID=$!

# Wait a bit for the server to start
sleep 2

# Display a message with instructions
echo "=================================================="
echo "Streaming server is now running on port $PORT"
echo ""
echo "To test streaming chat functionality, open the app and send a message."
echo "You should see the response appear character by character."
echo ""
echo "Press Ctrl+C to stop the servers when finished."
echo "=================================================="

# Keep the script running until Ctrl+C
trap "kill $STREAMING_PID; echo 'Servers stopped.'; exit" INT TERM
wait $STREAMING_PID