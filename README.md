# FIM Completions

A minimal VS Code extension that provides inline (ghost-text) code completions using a custom Fill-In-the-Middle (FIM) model. It leverages VS Code's native `InlineCompletionItemProvider` API — the same mechanism GitHub Copilot uses — but sends requests to a user-configurable `/api/generate`-style endpoint.

## Features

- **Ghost-text completions** as you type, powered by any FIM-compatible model.
- **Backend-agnostic**: works with Ollama, llama.cpp, vLLM, or any server implementing a `/api/generate` endpoint.
- **Minimal configuration**: just three settings (`enabled`, `model`, `apiUrl`).
- **Debounced, cancellable requests** to avoid hammering your backend.

## Requirements

- VS Code 1.90+
- A running LLM backend that exposes a `/api/generate` endpoint accepting `{ model, prompt, suffix?, stream, options }` and returning `{ response: string }`.

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fim.enabled` | `boolean` | `true` | Enable/disable inline completions. |
| `fim.model` | `string` | `""` | Model name to use (e.g. `deepseek-coder:1.3b`, `qwen2.5-coder:1.5b`). Leave empty to disable. |
| `fim.apiUrl` | `string` | `http://localhost:11434` | Base URL of the generate API endpoint. |

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
