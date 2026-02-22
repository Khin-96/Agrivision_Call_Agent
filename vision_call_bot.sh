#!/bin/bash

# Agrivision Voice Bot Startup Script
# This script starts the backend server and the ngrok tunnel simultaneously.

echo "------------------------------------------------"
echo " Starting Agrivision Voice Bot System..."
echo "------------------------------------------------"

# 1. Kill any existing processes on port 3000 (cleanup)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows/Git Bash cleanup
    PID=$(netstat -ano | grep :3000 | grep LISTENING | awk '{print $5}' | head -n 1)
    if [ ! -z "$PID" ]; then
        echo "Cleaning up existing process on port 3000..."
        taskkill //F //PID $PID > /dev/null 2>&1
    fi
else
    # Linux/Mac cleanup
    lsof -ti:3000 | xargs kill -9 > /dev/null 2>&1
fi

# 2. Start the Backend Server in the background
echo "Starting Backend Server..."
npm start &
BACKEND_PID=$!

# 3. Start ngrok tunnel in the background
echo "Starting ngrok tunnel..."
npx ngrok http 3000 &
NGROK_PID=$!

# 4. Wait for tunnel to initialize and display URL
echo "Waiting for tunnel to initialize..."
sleep 5

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python -c "import sys, json; print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
    echo "  Could not fetch ngrok URL. Please check if ngrok is running."
else
    echo "------------------------------------------------"
    echo " SUCCESS: System is online!"
    echo "------------------------------------------------"
    echo " Webhook URL: $NGROK_URL/voice"
    echo " Live Dashboard: http://localhost:3000/dashboard"
    echo " Dial Agent: +1 831 273 6077"
    echo "------------------------------------------------"
    echo "Press Ctrl+C to stop both services."
fi

# Keep script running to maintain child processes
trap "kill $BACKEND_PID $NGROK_PID; exit" SIGINT SIGTERM
wait
