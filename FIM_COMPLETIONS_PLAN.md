# Plan: Minimal VS Code Extension for Custom FIM Inline Completions

## Overview

This plan outlines how to create a minimal VS Code extension that provides **inline (ghost-text) code completions** using a custom Fill-In-the-Middle (FIM) model. It leverages VS Code's native `InlineCompletionItemProvider` API (the same mechanism GitHub Copilot uses) but sends requests to a user-configurable `/api/generate`-style endpoint instead of Copilot's chat API.

This extension is **independent of Ollama** — you can point it at any HTTP endpoint that accepts a prompt and returns generated text.

---

## 1. Architecture Summary

```
User types in editor
        ↓
VS Code invokes InlineCompletionItemProvider
        ↓
Extension extracts prefix (before cursor) + suffix (after cursor)
        ↓
Debounced HTTP POST to /api/generate (or your endpoint)
        ↓
Response text → InlineCompletionItem → Ghost text rendered
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Use `InlineCompletionItemProvider`** | Native VS Code API; works exactly like Copilot ghost text. No need for custom UI. |
| **Call `/api/generate` instead of chat** | FIM models expect a single prompt+suffix, not a message array. Lower latency. |
| **No Ollama dependency** | Use raw `fetch` so any compatible backend works (llama.cpp, vLLM, custom servers). |
| **Two settings only** | `fim.model` (endpoint URL or model name) and `fim.enabled` (boolean). Keeps it minimal. |
| **Debounce + cancel** | Essential for performance; avoids spamming the backend on every keystroke. |

---

## 2. File Structure

```
fim-completions/
├── package.json              # Extension manifest, settings, activation events
├── tsconfig.json             # TypeScript config (ES2024, Bundler moduleResolution)
├── tsup.config.ts            # Build config (bundles to dist/extension.js)
├── vitest.config.ts          # Test config with vscode mock
├── src/
│   ├── extension.ts          # Entry point: activate(), register provider
│   ├── completions.ts        # InlineCompletionItemProvider implementation
│   ├── settings.ts           # getSetting() helper for fim.enabled / fim.model
│   ├── client.ts             # Thin HTTP client wrapping fetch for /api/generate
│   └── test/
│       ├── vscode.mock.ts    # Minimal vscode API mock for unit tests
│       └── setup.ts          # Vitest setup (restore mocks, etc.)
```

---

## 3. Core Implementation Details

### 3.1 `src/completions.ts` — The Provider

Implement `vscode.InlineCompletionItemProvider`:

```ts
export class FimCompletionProvider implements vscode.InlineCompletionItemProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly model: string,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | null> {
    if (token.isCancellationRequested) return null;

    // 1. Read settings
    if (!getSetting<boolean>('enabled', true)) return null;
    const model = getSetting<string>('model', '').trim();
    if (!model) return null;

    // 2. Extract prefix / suffix around cursor
    const offset = document.offsetAt(position);
    const prefixStart = Math.max(0, offset - MAX_PREFIX_CHARS);
    const prefix = document.getText(new vscode.Range(document.positionAt(prefixStart), position));
    const suffixEnd = Math.min(document.getText().length, offset + MAX_SUFFIX_CHARS);
    const suffix = document.getText(new vscode.Range(position, document.positionAt(suffixEnd)));

    // 3. Call backend
    try {
      const response = await fetchGenerate(this.apiUrl, {
        model,
        prompt: prefix,
        suffix: suffix || undefined,
        stream: false,
        options: { num_predict: 128, temperature: 0.1, stop: ['\n\n'] },
      });

      if (token.isCancellationRequested) return null;
      if (!response?.response?.trim()) return null;

      return [new vscode.InlineCompletionItem(response.response)];
    } catch (err) {
      console.error('[FIM] Completion failed:', err);
      return null;
    }
  }
}
```

**Constants to define:**
- `MAX_PREFIX_CHARS = 2000` — how much code before cursor to send
- `MAX_SUFFIX_CHARS = 500` — how much code after cursor to send

**Why these values?** They match the reference implementation and balance context length vs. latency.

### 3.2 `src/client.ts` — HTTP Client

A thin wrapper around `fetch` (no `ollama` npm package):

```ts
export interface GenerateRequest {
  model: string;
  prompt: string;
  suffix?: string;
  stream: false;
  options?: {
    num_predict?: number;
    temperature?: number;
    stop?: string[];
  };
}

export interface GenerateResponse {
  response: string;
}

export async function fetchGenerate(
  baseUrl: string,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

**Notes:**
- If your backend uses a different path (e.g., `/v1/completions`), change the URL here.
- You can extend this later to support streaming (`stream: true` with NDJSON parsing).

### 3.3 `src/settings.ts` — Configuration Helper

```ts
import * as vscode from 'vscode';

const NS = 'fim';

export function getSetting<T>(key: string, defaultValue?: T): T | undefined {
  return vscode.workspace.getConfiguration(NS).get<T>(key) ?? defaultValue;
}
```

### 3.4 `src/extension.ts` — Activation

```ts
import * as vscode from 'vscode';
import { FimCompletionProvider } from './completions.js';
import { getSetting } from './settings.js';

export function activate(context: vscode.ExtensionContext): void {
  const enabled = getSetting<boolean>('enabled', true);
  const model = getSetting<string>('model', '');
  const apiUrl = getSetting<string>('apiUrl', 'http://localhost:11434');

  if (!enabled || !model) return;

  const provider = new FimCompletionProvider(apiUrl, model);

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' }, // all files
    provider,
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
```

**Important:** The provider is registered for `{ pattern: '**' }` (all files). You can scope it to specific languages later (e.g., `{ scheme: 'file', language: 'typescript' }`).

---

## 4. `package.json` — Manifest & Settings

```json
{
  "name": "fim-completions",
  "displayName": "FIM Completions",
  "version": "0.1.0",
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Machine Learning", "Snippets"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "configuration": {
      "title": "FIM Completions",
      "properties": {
        "fim.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable inline FIM completions."
        },
        "fim.model": {
          "type": "string",
          "default": "",
          "description": "Model name to use for completions (e.g., deepseek-coder:1.3b)."
        },
        "fim.apiUrl": {
          "type": "string",
          "default": "http://localhost:11434",
          "description": "Base URL of the generate API endpoint."
        }
      }
    }
  }
}
```

---

## 5. Build & Test Setup

### 5.1 Dependencies

```bash
npm install -D typescript @types/vscode @types/node tsup vitest
```

### 5.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "preserve",
    "moduleResolution": "Bundler",
    "target": "ES2024",
    "lib": ["ES2024"],
    "types": ["node"],
    "strict": true,
    "rootDir": "src",
    "outDir": "out",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

### 5.3 `tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  external: ['vscode'],
  sourcemap: true,
  clean: true,
});
```

### 5.4 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(__dirname, 'src/test/vscode.mock.ts'),
    },
  },
  test: {
    environment: 'node',
    restoreMocks: true,
  },
});
```

### 5.5 `src/test/vscode.mock.ts`

Minimal mock of the vscode APIs you actually use:

```ts
export const workspace = {
  getConfiguration: () => ({
    get: (key: string) => undefined,
  }),
};

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(public start: Position, public end: Position) {}
}

export class InlineCompletionItem {
  constructor(public insertText: string) {}
}
```

---

## 6. Testing Strategy

Write unit tests in `src/completions.test.ts` covering:

1. **Disabled by setting** — returns `null` when `fim.enabled` is `false`.
2. **Empty model** — returns `null` when `fim.model` is empty/whitespace.
3. **Prefix/suffix extraction** — verify the correct text slices are sent to the backend.
4. **Cancellation** — returns `null` when `token.isCancellationRequested` is `true`.
5. **Backend error** — returns `null` and logs error on HTTP failure.
6. **Happy path** — returns an `InlineCompletionItem` with the generated text.

Use `vi.doMock('vscode', ...)` to inject mocked settings per test, as shown in the reference implementation.

---

## 7. Advanced Features (Optional Future Work)

| Feature | How to Add |
|---------|-----------|
| **Debouncing** | Wrap `provideInlineCompletionItems` body in a `setTimeout` / `clearTimeout` or use `lodash.debounce`. VS Code also has built-in debounce, but explicit control is safer. |
| **Request cancellation** | Pass `token` into `fetch` via an `AbortController`. Cancel the controller when `token.onCancellationRequested` fires. |
| **Streaming** | Change `stream: true`, parse NDJSON lines, and yield partial results. VS Code `InlineCompletionItem` does not natively stream, but you can update the item in a follow-up request. |
| **Language-specific models** | Change the `registerInlineCompletionItemProvider` selector from `{ pattern: '**' }` to language-specific selectors and read a map setting like `fim.models.typescript`. |
| **Custom FIM tokens** | Some models (e.g., `deepseek-coder`) expect special tokens like `<｜fim▁begin｜>`. Add a `fim.template` setting and wrap prefix/suffix accordingly before sending. |

---

## 8. How It Differs from the Reference (Opilot)

| Aspect | Opilot | Your Minimal Extension |
|--------|--------|----------------------|
| **Backend** | Hard dependency on `ollama` npm package | Raw `fetch` to any `/api/generate` endpoint |
| **Settings** | 10+ Ollama-specific settings | 3 settings: `enabled`, `model`, `apiUrl` |
| **Scope** | Full chat participant + sidebar + modelfiles | Inline completions only |
| **FIM support** | Uses `suffix` param via Ollama client | Uses `suffix` param via JSON POST body |
| **Tests** | Vitest + complex vscode mock | Same stack, simpler mock |

---

## 9. Next Steps

1. **Create a new folder** (e.g., `~/fim-completions/`) and run `npm init -y`.
2. **Install dependencies** listed in §5.1.
3. **Copy the file structure** from §2 and implement each file using the code snippets above.
4. **Run `npx tsup`** to build `dist/extension.js`.
5. **Press F5** in VS Code (with the new folder open) to launch the Extension Development Host.
6. **Open a file, start typing**, and verify ghost text appears.
7. **Iterate** on debounce, cancellation, and custom FIM templates as needed.

---

*This plan is derived from the inline completion implementation in the `selfagency/opilot` repository, stripped down to its essential mechanics and decoupled from Ollama-specific infrastructure.*
