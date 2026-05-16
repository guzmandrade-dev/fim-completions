# Ollama FIM

A minimal VS Code extension that provides inline (ghost-text) code completions using Fill-In-the-Middle (FIM) models via Ollama.

## Features

- **Ghost-text completions** as you type, powered by FIM-capable models
- **Multi-model support**: Works with rnj-1, DeepSeek-Coder, Qwen3-Coder, Gemma3, and Codestral/Ministral
- **FIM-optimized**: Uses each model's native FIM tokens for best results
- **Minimal configuration**: just set your Ollama URL and choose your model family
- **Debounced, cancellable requests** to avoid hammering your backend

## Supported Models

| Family | Format | Example Model ID |
|--------|--------|------------------|
| **rnj-1** | &lt;\|pre_fim\|&gt;...&lt;\|suf_fim\|&gt;...&lt;\|mid_fim\|&gt; | `rnj-1:8b-cloud` |
| **deepseek** | &lt;\|fim_begin\|&gt;...&lt;\|fim_hole\|&gt;...&lt;\|fim_end\|&gt; | `deepseek-coder-v2:lite-instruct` |
| **qwen** | &lt;\|fim_prefix\|&gt;...&lt;\|fim_suffix\|&gt;...&lt;\|fim_middle\|&gt; | `qwen3-coder-next:latest` |
| **gemma** | &lt;\|fim_prefix\|&gt;...&lt;\|fim_middle\|&gt;...&lt;\|fim_suffix\|&gt; | `gemma3:latest` |
| **mistral** | &lt;\|fim_prefix\|&gt;...&lt;\|fim_suffix\|&gt;...&lt;\|fim_middle\|&gt; | `codestral:latest` |

## Requirements

- VS Code 1.90+
- Ollama running with your chosen FIM model pulled

## Setup

1. Install Ollama: https://ollama.com
2. Pull your chosen model (e.g., rnj-1):
   ```bash
   ollama pull rnj-1:8b-cloud
   ```
3. Start Ollama (usually runs on `http://localhost:11434`)
4. Configure the extension settings to match your model

## Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fim.enabled` | `boolean` | `true` | Enable/disable inline completions |
| `fim.apiUrl` | `string` | `http://localhost:11434` | Base URL of the Ollama API endpoint |
| `fim.maxTokens` | `number` | `256` | Maximum tokens to generate per completion |
| `fim.model` | `enum` | `rnj-1` | Model family (rnj-1, deepseek, qwen, gemma, mistral) |
| `fim.modelId` | `string` | (from family) | Specific Ollama model ID to use |

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
