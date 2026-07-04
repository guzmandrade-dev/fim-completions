# Ollama FIM — Agent Notes

This file contains context useful for AI agents working on the VS Code extension.

## Project Overview

This extension provides inline (ghost-text) code completions using Fill-In-the-Middle (FIM) models. It is a sibling project to the Vim plugin at `C:\Users\guzma\Git\ollama-fim.vim` and should stay aligned with its prompt, endpoint, and defaults conventions.

## Build & Test

```bash
npm install
npm run compile
npm test
```

- `npm run compile` uses `tsup` to bundle `src/extension.ts` into `dist/extension.js`.
- `npm test` runs Vitest tests under `src/**/*.test.ts`.

## Architecture

- `src/extension.ts` — activation entry point, registers the inline completion provider and API-key commands.
- `src/completions.ts` — `InlineCompletionItemProvider` implementation; gathers prefix/suffix/context and calls the client.
- `src/client.ts` — backend-agnostic HTTP client. Supports `ollama` (`/api/generate`) and `openai` (`/v1/completions`) backends.
- `src/context.ts` — optional file-level context extraction and current-scope detection.
- `src/settings.ts` — thin wrapper over `vscode.workspace.getConfiguration("fim")`.
- `src/secrets.ts` — stores/retrieves the optional API key from VS Code secret storage, falling back to `OLLAMA_API_KEY`.
- `src/test/vscode.mock.ts` — mock for the `vscode` module used by tests.

## Backend & Endpoint Conventions

- `fim.backend` selects the request/response style: `ollama` or `openai`.
- `fim.apiPath` can override the default path. When empty:
  - `ollama` → `/api/generate`
  - `openai` → `/v1/completions`
- The client uses `fetch` directly. The `ollama` npm package is intentionally not used.
- For FIM-native model families (`qwen`, `deepseek`, `rnj-1`, `mistral`) the Ollama backend sends `raw: true` to bypass the chat template.
- For `ministral`, which does not support raw mode on Ollama Cloud, the client sends a system instruction instead.
- The OpenAI backend uses the text completions endpoint and sends `prompt` (and optional `suffix`) directly.

## Prompt & Stop Tokens

- `buildFimPrompt` in `src/client.ts` formats prompts per model family:
  - `qwen`/`deepseek`/`rnj-1`: `pre` + prefix + `suf` + suffix + `mid`
  - `gemma`: `pre` + prefix + `mid` + suffix + `suf`
  - `mistral`/`ministral`: `<s>[SUFFIX]suffix[PREFIX]prefix`
- Stop tokens include chat/markdown artifacts (`// Note:`, `Certainly!`, `Below is`, etc.) and context markers. For raw families and the OpenAI backend, FIM delimiter tokens are **not** added as stop tokens because they are part of the input format.

## Defaults

These values are intentionally conservative to keep local inference fast:

| Setting | Default | Rationale |
|---------|---------|-----------|
| `fim.model` | `qwen` | rnj-1 is no longer on Ollama Cloud |
| `fim.modelId` | `qwen2.5-coder:3b` | Fast local default for the qwen family |
| `fim.maxTokens` | `64` | Short, fast completions |
| `fim.includeFileContext` | `false` | Context features are opt-in |
| `fim.includeScopeInfo` | `false` | Only useful with file context |
| `fim.fileContextChars` | `500` | Small file context window |
| prefix window | `200` chars | Internal constant in `completions.ts` |
| suffix window | `50` chars | Internal constant in `completions.ts` |

## Model Families

| Family | FIM tokens | Raw mode | Notes |
|--------|-----------|----------|-------|
| `qwen` | `\|fim_prefix\|...\|fim_suffix\|...\|fim_middle\|` | yes | Default |
| `deepseek` | `\|fim_begin\|...\|fim_hole\|...\|fim_end\|` | yes | |
| `gemma` | `\|fim_prefix\|...\|fim_middle\|...\|fim_suffix\|` | no | Special token order |
| `mistral` | SPM `[PREFIX]...[SUFFIX]...` | yes | `<s>` BOS |
| `ministral` | SPM `[PREFIX]...[SUFFIX]...` | no | Uses instruction fallback |
| `rnj-1` | `\|pre_fim\|...\|suf_fim\|...\|mid_fim\|` | yes | Local only |

## Testing Notes

- `src/test/vscode.mock.ts` provides a mock `SecretStorage` because the provider requires it.
- Tests clear `process.env.OLLAMA_API_KEY` in `beforeEach` to avoid leaking real credentials.
- `vitest.config.ts` sets `unstubGlobals: false` so the global `fetch` stub used by `client.test.ts` persists across tests.

## When Modifying

- Keep the Vim plugin conventions in mind for prompt formatting and defaults.
- Avoid adding heavy dependencies; the project intentionally uses only `fetch` for HTTP.
- Update both `package.json` settings and `README.md` when adding or changing settings.
- Run `npm run compile` and `npm test` before committing.
