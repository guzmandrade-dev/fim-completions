# Ollama FIM

A minimal VS Code extension that provides inline (ghost-text) code completions using Fill-In-the-Middle (FIM) models via Ollama or any OpenAI-compatible completions endpoint.

## Features

- **Ghost-text completions** as you type, powered by FIM-capable models
- **Multi-model support**: Works with Qwen2.5-Coder, DeepSeek-Coder, Gemma3, Codestral, Ministral, and rnj-1 (local)
- **FIM-optimized**: Uses each model's native FIM tokens and raw mode to avoid chat-style responses
- **OpenAI-compatible backends**: Works with local Ollama `/v1/completions`, Together AI, or any compatible provider
- **Minimal configuration**: just set your API URL and choose your model family
- **Cancellable requests** to avoid hammering your backend

## Supported Models

| Family | Format | Default Model ID | Notes |
|--------|--------|------------------|-------|
| **qwen** | `\|fim_prefix\|...\|fim_suffix\|...\|fim_middle\|` | `qwen2.5-coder:3b` | Default family |
| **deepseek** | `\|fim_begin\|...\|fim_hole\|...\|fim_end\|` | `deepseek-coder-v2:lite-instruct` | |
| **gemma** | `\|fim_prefix\|...\|fim_middle\|...\|fim_suffix\|` | `gemma3:latest` | |
| **mistral** | SPM `[PREFIX]...[SUFFIX]...` | `codestral:latest` | Raw mode |
| **ministral** | SPM `[PREFIX]...[SUFFIX]...` | `ministral-3b-latest` | Instruction fallback |
| **rnj-1** | `\|pre_fim\|...\|suf_fim\|...\|mid_fim\|` | `rnj-1:8b-cloud` | Local only; no longer on Ollama Cloud |

## Requirements

- VS Code 1.90+
- An Ollama instance or an OpenAI-compatible API endpoint
- Your chosen FIM model pulled / available

## Setup (Ollama local)

1. Install Ollama: https://ollama.com
2. Pull the default model:
   ```bash
   ollama pull qwen2.5-coder:3b
   ```
3. Start Ollama (usually runs on `http://localhost:11434`)
4. Configure the extension settings to match your model

## Setup (OpenAI-compatible provider)

Example for Together AI using Qwen2.5-Coder:

```json
{
  "fim.backend": "openai",
  "fim.apiUrl": "https://api.together.ai/v1",
  "fim.apiPath": "/completions",
  "fim.model": "qwen",
  "fim.modelId": "Qwen/Qwen2.5-Coder-7B-Instruct"
}
```

Set an API key with the **FIM Completions: Set API Key** command, or use the `OLLAMA_API_KEY` environment variable.

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fim.enabled` | `boolean` | `true` | Enable/disable inline completions |
| `fim.backend` | `enum` | `ollama` | API style: `ollama` (`/api/generate`) or `openai` (`/v1/completions`) |
| `fim.apiUrl` | `string` | `http://localhost:11434` | Base URL of the API endpoint |
| `fim.apiPath` | `string` | (backend default) | Custom API path. `/api/generate` or `/v1/completions` if empty |
| `fim.maxTokens` | `number` | `64` | Maximum tokens to generate per completion |
| `fim.model` | `enum` | `qwen` | Model family (qwen, deepseek, gemma, mistral, ministral, rnj-1) |
| `fim.modelId` | `string` | (from family) | Specific model ID to use |
| `fim.includeFileContext` | `boolean` | `false` | Include imports/definitions in the prompt |
| `fim.includeScopeInfo` | `boolean` | `false` | Include current scope hint (only when file context is enabled) |
| `fim.fileContextChars` | `number` | `500` | Max characters of file context |

## Context Awareness

By default the extension sends only the immediate prefix and suffix. This keeps requests small and fast on local hardware. If you want richer suggestions on more powerful hosts, enable:

```json
{
  "fim.includeFileContext": true,
  "fim.includeScopeInfo": true,
  "fim.fileContextChars": 500
}
```

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

### 0.4.0

- Replaced the `ollama` npm package with direct `fetch`, supporting both Ollama and OpenAI-compatible backends
- Added `fim.backend` and `fim.apiPath` settings
- Changed default model from `rnj-1` to `qwen2.5-coder:3b`
- rnj-1 is still supported for local use but is no longer the default
- Added `ministral` model family with instruction fallback for non-raw FIM
- Disabled context awareness features by default and reduced context window sizes
- Added raw mode for FIM-native models to prevent chat-style responses
- Scope info now only appears when file context is also enabled

### 0.3.0

- Renamed extension to "Ollama FIM" for clarity
- Added GPL-3.0 license
- Added file context options for better completions:
  - `fim.includeFileContext` - Include imports, class definitions, function signatures
  - `fim.includeScopeInfo` - Include current scope information (e.g., "in class MyClass > function myMethod")
  - `fim.fileContextChars` - Configure max characters for file context
- Fixed README table rendering for GitHub
- Improved logging to show only model name instead of full request

### 0.2.0

- Added support for multiple FIM model families:
  - DeepSeek-Coder-V2 (deepseek)
  - Qwen3-Coder (qwen)
  - Gemma3 (gemma)
  - Codestral/Ministral (mistral)
- Added `fim.model` setting to select model family with token format descriptions
- Added `fim.modelId` setting for custom model IDs
- Updated default `maxTokens` to 256
- Cleaned up dead code and removed invalid tests

### 0.1.0

Initial release with basic FIM inline completions for rnj-1 model.
