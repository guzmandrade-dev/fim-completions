# FIM Completions

A minimal VS Code extension that provides inline (ghost-text) code completions using the **rnj-1** Fill-In-the-Middle (FIM) model. It leverages VS Code's native `InlineCompletionItemProvider` API — the same mechanism GitHub Copilot uses.

## Features

- **Ghost-text completions** as you type, powered by rnj-1's strong FIM capabilities (86.21% on HE-FIM-Python).
- **FIM-optimized**: Uses rnj-1's native FIM tokens (`<|pre_fim|>`, `<|suf_fim|>`, `<|mid_fim|>`).
- **Minimal configuration**: just set your Ollama URL.
- **Debounced, cancellable requests** to avoid hammering your backend.

## Requirements

- VS Code 1.90+
- Ollama running with the `rnj-1:8b-cloud` model pulled

## Setup

1. Install Ollama: https://ollama.com
2. Pull the rnj-1 model:
   ```bash
   ollama pull rnj-1:8b-cloud
   ```
3. Start Ollama (usually runs on `http://localhost:11434`)

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fim.enabled` | `boolean` | `true` | Enable/disable inline completions. |
| `fim.apiUrl` | `string` | `http://localhost:11434` | Base URL of the Ollama API endpoint. |
| `fim.maxTokens` | `number` | `128` | Maximum number of tokens to generate per completion. |

## Build

```bash
npm install
npm run compile
```

## Test

```bash
npm test
```

## Run

Open this folder in VS Code and press **F5** to launch the Extension Development Host. Open any file, start typing, and ghost-text completions should appear if your backend is running and `fim.model` is set.

## Release Notes

### 0.1.0

Initial release with basic FIM inline completions.
