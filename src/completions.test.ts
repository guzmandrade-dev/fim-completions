import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockConfig, SecretStorage } from "./test/vscode.mock.js";
import { FimCompletionProvider } from "./completions.js";
import { fetchGenerate } from "./client.js";

vi.mock("./client.js", () => ({
  fetchGenerate: vi.fn(),
}));

describe("FimCompletionProvider", () => {
  let secretStorage: SecretStorage;

  beforeEach(() => {
    secretStorage = new SecretStorage();
    delete process.env.OLLAMA_API_KEY;
    vi.mocked(fetchGenerate).mockResolvedValue({ response: "const x = 1;" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    setMockConfig({});
  });

  function makeToken(isCancellationRequested = false) {
    return { isCancellationRequested };
  }

  function makePosition(line: number, character: number) {
    return { line, character };
  }

  function makeDocument(
    text: string,
    cursorLine: number,
    cursorChar: number,
    fileName = "test.ts",
    languageId = "typescript",
  ) {
    const lines = text.split("\n");

    const positionAt = (off: number) => {
      let line = 0;
      let char = off;
      for (let i = 0; i < lines.length; i++) {
        if (char <= lines[i].length) {
          line = i;
          break;
        }
        char -= lines[i].length + 1; // +1 for newline
      }
      return { line, character: char };
    };

    return {
      fileName,
      languageId,
      getText: (range?: unknown) => {
        if (!range) return text;
        const r = range as {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        const startLine = r.start.line;
        const endLine = r.end.line;
        const startChar = r.start.character;
        const endChar = r.end.character;

        const selectedLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          if (i >= 0 && i < lines.length) {
            if (i === startLine && i === endLine) {
              selectedLines.push(lines[i].substring(startChar, endChar));
            } else if (i === startLine) {
              selectedLines.push(lines[i].substring(startChar));
            } else if (i === endLine) {
              selectedLines.push(lines[i].substring(0, endChar));
            } else {
              selectedLines.push(lines[i]);
            }
          }
        }
        return selectedLines.join("\n");
      },
      offsetAt: (pos: { line: number; character: number }) => {
        let offset = 0;
        for (let i = 0; i < pos.line && i < lines.length; i++) {
          offset += lines[i].length + 1;
        }
        if (pos.line < lines.length) {
          offset += pos.character;
        } else {
          offset = text.length;
        }
        return offset;
      },
      positionAt,
      lineCount: lines.length,
    };
  }

  function makeProvider(
    apiUrl = "http://localhost:11434",
    apiPath = "/api/generate",
    backend: import("./client.js").Backend = "ollama",
    model = "qwen2.5-coder:3b",
    modelType: import("./client.js").FimModelType = "qwen",
  ) {
    return new FimCompletionProvider(
      apiUrl,
      apiPath,
      backend,
      model,
      modelType,
      secretStorage as any,
    );
  }

  it("returns null when enabled is false", async () => {
    setMockConfig({ enabled: false, model: "qwen" });
    const provider = makeProvider();
    const result = await provider.provideInlineCompletionItems(
      makeDocument("hello", 0, 5) as any,
      makePosition(0, 5) as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  it("calls fetchGenerate with correct prefix and suffix", async () => {
    setMockConfig({ enabled: true, model: "qwen" });
    const provider = makeProvider();

    const text = "hello world";
    const result = await provider.provideInlineCompletionItems(
      makeDocument(text, 0, 5) as any,
      makePosition(0, 5) as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      "http://localhost:11434",
      "/api/generate",
      "ollama",
      expect.objectContaining({
        model: "qwen2.5-coder:3b",
        suffix: " world",
        modelType: "qwen",
      }),
      undefined,
    );

    expect(result).toHaveLength(1);
    expect((result![0] as any).insertText).toBe("const x = 1;");
  });

  it("sends apiKey to fetchGenerate when set", async () => {
    secretStorage.store("fim.apiKey", "secret-token");
    setMockConfig({
      enabled: true,
      model: "qwen",
    });
    const provider = makeProvider();

    const text = "this is a longer hello world";
    await provider.provideInlineCompletionItems(
      makeDocument(text, 0, 20) as any,
      makePosition(0, 20) as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      "http://localhost:11434",
      "/api/generate",
      "ollama",
      expect.any(Object),
      "secret-token",
    );
  });

  it("uses custom maxTokens when set", async () => {
    setMockConfig({
      enabled: true,
      model: "qwen",
      maxTokens: 256,
    });
    const provider = makeProvider();

    const text = "this is a longer hello world";
    await provider.provideInlineCompletionItems(
      makeDocument(text, 0, 20) as any,
      makePosition(0, 20) as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      "http://localhost:11434",
      "/api/generate",
      "ollama",
      expect.objectContaining({
        options: expect.objectContaining({ num_predict: 256, max_tokens: 256 }),
      }),
      undefined,
    );
  });

  it("returns null when token is already cancelled", async () => {
    setMockConfig({ enabled: true, model: "qwen" });
    const provider = makeProvider();
    const result = await provider.provideInlineCompletionItems(
      makeDocument("hello", 0, 5) as any,
      makePosition(0, 5) as any,
      {} as any,
      makeToken(true) as any,
    );

    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    vi.mocked(fetchGenerate).mockRejectedValue(new Error("ECONNREFUSED"));

    setMockConfig({ enabled: true, model: "qwen" });
    const provider = makeProvider();
    const result = await provider.provideInlineCompletionItems(
      makeDocument("hello", 0, 5) as any,
      makePosition(0, 5) as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  describe("model type handling", () => {
    it("uses deepseek model type correctly", async () => {
      setMockConfig({ enabled: true, model: "deepseek" });
      const provider = makeProvider(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        "deepseek-coder-v2:lite-instruct",
        "deepseek",
      );

      await provider.provideInlineCompletionItems(
        makeDocument("hello world", 0, 5) as any,
        makePosition(0, 5) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledWith(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        expect.objectContaining({
          model: "deepseek-coder-v2:lite-instruct",
          modelType: "deepseek",
        }),
        undefined,
      );
    });

    it("uses qwen model type correctly", async () => {
      setMockConfig({ enabled: true, model: "qwen" });
      const provider = makeProvider(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        "qwen2.5-coder:3b",
        "qwen",
      );

      await provider.provideInlineCompletionItems(
        makeDocument("hello world", 0, 5) as any,
        makePosition(0, 5) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledWith(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        expect.objectContaining({
          model: "qwen2.5-coder:3b",
          modelType: "qwen",
        }),
        undefined,
      );
    });

    it("uses gemma model type correctly", async () => {
      setMockConfig({ enabled: true, model: "gemma" });
      const provider = makeProvider(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        "gemma3:latest",
        "gemma",
      );

      await provider.provideInlineCompletionItems(
        makeDocument("hello world", 0, 5) as any,
        makePosition(0, 5) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledWith(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        expect.objectContaining({
          model: "gemma3:latest",
          modelType: "gemma",
        }),
        undefined,
      );
    });

    it("uses mistral model type correctly", async () => {
      setMockConfig({ enabled: true, model: "mistral" });
      const provider = makeProvider(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        "codestral:latest",
        "mistral",
      );

      await provider.provideInlineCompletionItems(
        makeDocument("hello world", 0, 5) as any,
        makePosition(0, 5) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledWith(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        expect.objectContaining({
          model: "codestral:latest",
          modelType: "mistral",
        }),
        undefined,
      );
    });
  });

  describe("file context", () => {
    it("includes file context when enabled", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen",
        includeFileContext: true,
        includeScopeInfo: false,
      });
      const provider = makeProvider();

      const code = `import { useState } from "react";
import { fetchData } from "./api";

const CONFIG = { timeout: 5000 };

function App() {
  const [data, setData] = useState(null);
  const value =
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 6, 15, "App.tsx", "typescript") as any,
        makePosition(6, 15) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledTimes(1);
      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[3] as any).prefix;

      // Should include imports
      expect(prefix).toContain("import { useState }");
      expect(prefix).toContain("import { fetchData }");
      // Should include class/function definitions
      expect(prefix).toContain("const CONFIG");
      expect(prefix).toContain("function App()");
    });

    it("excludes file context by default", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen",
      });
      const provider = makeProvider();

      const code = `import { useState } from "react";

function App() {
  const x = 
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 3, 10, "App.tsx", "typescript") as any,
        makePosition(3, 10) as any,
        {} as any,
        makeToken() as any,
      );

      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[3] as any).prefix;

      // Should NOT include context markers
      expect(prefix).not.toContain("<|file_context|>");
      // Should just have the immediate prefix (cursor is after the space)
      expect(prefix).toContain("const x");
    });

    it("does not include scope info when file context is disabled", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen",
        includeFileContext: false,
        includeScopeInfo: true,
      });
      const provider = makeProvider();

      const code = `class MyClass {
  calculate() {
    return 
  }
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 2, 11, "example.ts", "typescript") as any,
        makePosition(2, 11) as any,
        {} as any,
        makeToken() as any,
      );

      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[3] as any).prefix;

      // Scope hint should be ignored without file context
      expect(prefix).not.toContain("// Currently in:");
    });

    it("includes scope info when both context features are enabled", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen",
        includeFileContext: true,
        includeScopeInfo: true,
      });
      const provider = makeProvider();

      const code = `class MyClass {
  constructor() {
    this.value = 0;
  }
  
  calculate() {
    return 
  }
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 5, 11, "example.ts", "typescript") as any,
        makePosition(5, 11) as any,
        {} as any,
        makeToken() as any,
      );

      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[3] as any).prefix;

      // Should include scope hint
      expect(prefix).toContain("// Currently in:");
    });
  });

  describe("OpenAI backend", () => {
    it("uses openai backend and custom api path", async () => {
      setMockConfig({ enabled: true, model: "qwen", backend: "openai" });
      const provider = makeProvider(
        "https://api.together.ai/v1",
        "/completions",
        "openai",
        "Qwen/Qwen2.5-Coder-7B-Instruct",
        "qwen",
      );

      await provider.provideInlineCompletionItems(
        makeDocument("hello world", 0, 5) as any,
        makePosition(0, 5) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledWith(
        "https://api.together.ai/v1",
        "/completions",
        "openai",
        expect.objectContaining({
          model: "Qwen/Qwen2.5-Coder-7B-Instruct",
          modelType: "qwen",
        }),
        undefined,
      );
    });
  });
});
