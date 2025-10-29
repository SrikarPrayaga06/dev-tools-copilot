# dev-tools-copilot

A developer tool for capturing screenshots and processing them with AI.

## Keyboard Shortcuts

All shortcuts are **global** and work regardless of which application is focused:

- **Cmd+H** - Take a screenshot
- **Cmd+Return** (Enter) - Process screenshots and get solutions
- **Cmd+R** - Reset view and clear queues
- **Cmd+B** - Toggle window visibility
- **Cmd+Arrow Keys** - Move window (Left/Right/Up/Down)
- **Cmd+[** / **Cmd+]** - Decrease/Increase opacity
- **Cmd+L** - Delete last screenshot
- **Cmd+Q** - Quit application

## Configuration

API keys and settings are stored in `config.json` in the project root (for development) or in the user data directory.

Create a `config.json` file based on `config.json.example`:

```json
{
  "apiKey": "your-api-key-here",
  "apiProvider": "openai",
  "extractionModel": "gpt-4o",
  "solutionModel": "gpt-4o",
  "debuggingModel": "gpt-4o",
  "language": "python",
  "opacity": 1.0
}
```

## Running the App

```bash
# Development mode
npm run dev

# Production build
npm run build

# Run in stealth mode (invisible by default)
./stealth-run.sh
```

### Stealth Mode

The app can run invisibly in the background. Logs are saved to `~/Library/Logs/interview-coder-v1/`. You can safely close the terminal after launching.

## Important Notes

- The **Cmd+Return** shortcut is now more reliable with debouncing to prevent multiple triggers
- Global shortcuts work even when the app window is not focused
- The app window accepts mouse events immediately for better responsiveness