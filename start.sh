#!/bin/bash

echo "========================================="
echo "🚀 Starting TestRail Proxy Server..."
echo "========================================="

# Kill existing node server.js if it is running on port 3000
pkill -f "node server.js" || true

# Start the proxy server in the background
node server.js &
SERVER_PID=$!

# Trap Ctrl+C (SIGINT) to kill the background server cleanly
trap "echo '🛑 Shutting down proxy server...'; kill $SERVER_PID; exit" SIGINT SIGTERM

# Wait a second for it to initialize
sleep 1

# Open the app via the local server (IMPORTANT: file:// URLs cannot make fetch calls)
echo "🌐 Opening Test Reporter Dashboard at http://localhost:3000 ..."
sleep 1
xdg-open http://localhost:3000/index.html

echo ""
echo "✅ Proxy server is running in the background."
echo "⚠️  Keep this terminal open while you use the dashboard."
echo "🛑 Press Ctrl+C in this terminal to shut down the proxy when you are done."

# Wait for the server process so the terminal doesn't close immediately
wait $SERVER_PID
