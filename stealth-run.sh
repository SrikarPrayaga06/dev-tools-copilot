#!/bin/bash
echo "=== dev-tools-copilot - Invisible Edition (No Paywall) ==="
echo
echo "IMPORTANT: This app is designed to be INVISIBLE by default!"
echo "Use the keyboard shortcuts to control it:"
echo
echo "- Toggle Visibility: Cmd+B"
echo "- Take Screenshot: Cmd+H"
echo "- Process Screenshots: Cmd+Enter"
echo "- Move Window: Cmd+Arrows (Left/Right/Up/Down)"
echo "- Adjust Opacity: Cmd+[ (decrease) / Cmd+] (increase)"
echo "- Reset View: Cmd+R"
echo "- Quit App: Cmd+Q"
echo
echo "When you press Cmd+B, the window will toggle between visible and invisible."
echo "If movement shortcuts aren't working, try making the window visible first with Cmd+B."
echo

# Navigate to script directory
cd "$(dirname "$0")"

echo "=== Step 1: Creating required directories... ==="
mkdir -p ~/Library/Application\ Support/interview-coder-v1/temp
mkdir -p ~/Library/Application\ Support/interview-coder-v1/cache
mkdir -p ~/Library/Application\ Support/interview-coder-v1/screenshots
mkdir -p ~/Library/Application\ Support/interview-coder-v1/extra_screenshots

echo "=== Step 2: Cleaning previous builds... ==="
echo "Removing old build files to ensure a fresh start..."
rm -rf dist dist-electron
rm -f .env

echo "=== Step 3: Building application... ==="
echo "This may take a moment..."
npm run build

echo "=== Step 4: Launching in stealth mode... ==="
echo "Remember: Cmd+B to make it visible, Cmd+[ and Cmd+] to adjust opacity!"
echo

# Create logs directory
mkdir -p ~/Library/Logs/interview-coder-v1

# Set up log file with timestamp
LOG_FILE=~/Library/Logs/interview-coder-v1/app_$(date +%Y%m%d_%H%M%S).log

echo "Logs will be saved to: $LOG_FILE"
echo

export NODE_ENV=production

# Run the app detached from terminal, redirect output to log file
nohup npx electron ./dist-electron/main.js > "$LOG_FILE" 2>&1 &

# Get the PID
APP_PID=$!

echo "App is now running invisibly! (PID: $APP_PID)"
echo "Press Cmd+B to make it visible."
echo
echo "Logs are being saved to:"
echo "$LOG_FILE"
echo
echo "You can now safely close this terminal window."
echo
echo "To stop the app:"
echo "- Press Cmd+Q while the app is active, or"
echo "- Run: kill $APP_PID"
echo
echo "If you encounter any issues:"
echo "1. Check the log file for errors"
echo "2. Make sure you've installed dependencies with 'npm install'"
echo "3. Press Cmd+B multiple times to toggle visibility"
echo "4. Check Activity Monitor to verify the app is running"
