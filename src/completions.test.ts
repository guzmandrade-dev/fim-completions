import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockConfig } from "./test/vscode.mock.js";
import { FimCompletionProvider } from "./completions.js";
import { fetchGenerate } from "./client.js";

vi.mock("./client.js", () => ({
  fetchGenerate: vi.fn(),
}));

describe("FimCompletionProvider", () => {
  beforeEach(() => {
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
        const r = range as { start: { line: number; character: number }; end: { line: number; character: number } };
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

  it("returns null when enabled is false", async () => {
    setMockConfig({ enabled: false, model: "llama3.2" });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "llama3.2",
      "rnj-1",
    );
    const result = await provider.provideInlineCompletionItems(
      makeDocument("hello", 0, 5) as any,
      makePosition(0, 5) as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  it("calls fetchGenerate with correct prefix and suffix", async () => {
    setMockConfig({ enabled: true, model: "qwen2.5-coder:1.5b" });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "qwen2.5-coder:1.5b",
      "rnj-1",
    );

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
      expect.objectContaining({
        model: "qwen2.5-coder:1.5b",
        suffix: " world",
        modelType: "rnj-1",
      }),
      undefined,
    );

    expect(result).toHaveLength(1);
    expect((result![0] as any).insertText).toBe("const x = 1;");
  });

  it("sends apiKey to fetchGenerate when set", async () => {
    setMockConfig({
      enabled: true,
      model: "qwen2.5-coder:1.5b",
      apiKey: "secret-token",
    });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "qwen2.5-coder:1.5b",
      "rnj-1",
    );

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
      expect.any(Object),
      "secret-token",
    );
  });

  it("uses custom maxTokens when set", async () => {
    setMockConfig({
      enabled: true,
      model: "qwen2.5-coder:1.5b",
      maxTokens: 256,
    });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "qwen2.5-coder:1.5b",
      "rnj-1",
    );

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
      expect.objectContaining({
        options: expect.objectContaining({ num_predict: 256 }),
      }),
      undefined,
    );
  });

  it("returns null when token is already cancelled", async () => {
    setMockConfig({ enabled: true, model: "qwen2.5-coder:1.5b" });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "qwen2.5-coder:1.5b",
      "rnj-1",
    );
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

    setMockConfig({ enabled: true, model: "qwen2.5-coder:1.5b" });
    const provider = new FimCompletionProvider(
      "http://localhost:11434",
      "qwen2.5-coder:1.5b",
      "rnj-1",
    );
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
      setMockConfig({
        enabled: true,
        model: "deepseek-coder-v2:lite-instruct",
      });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
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
        expect.objectContaining({
          model: "deepseek-coder-v2:lite-instruct",
          modelType: "deepseek",
        }),
        undefined,
      );
    });

    it("uses qwen model type correctly", async () => {
      setMockConfig({ enabled: true, model: "qwen3-coder-next:latest" });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
        "qwen3-coder-next:latest",
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
        expect.objectContaining({
          model: "qwen3-coder-next:latest",
          modelType: "qwen",
        }),
        undefined,
      );
    });

    it("uses gemma model type correctly", async () => {
      setMockConfig({ enabled: true, model: "gemma3:latest" });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
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
        expect.objectContaining({
          model: "gemma3:latest",
          modelType: "gemma",
        }),
        undefined,
      );
    });

    it("uses mistral model type correctly", async () => {
      setMockConfig({ enabled: true, model: "codestral:latest" });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
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
        model: "qwen2.5-coder:1.5b",
        includeFileContext: true,
        includeScopeInfo: false,
      });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
        "qwen2.5-coder:1.5b",
        "rnj-1",
      );

      const code = `import { useState } from "react";
import { fetchData } from "./api";

const CONFIG = { timeout: 5000 };

function App() {
  const [data, setData] = useState(null);
  
  // Cursor here
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 7, 19, "App.tsx", "typescript") as any,
        makePosition(7, 19) as any,
        {} as any,
        makeToken() as any,
      );

      expect(fetchGenerate).toHaveBeenCalledTimes(1);
      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[1] as any).prefix;

      // Should include imports
      expect(prefix).toContain("import { useState }");
      expect(prefix).toContain("import { fetchData }");
      // Should include class/function definitions
      expect(prefix).toContain("const CONFIG");
      expect(prefix).toContain("function App()");
    });

    it("excludes file context when disabled", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen2.5-coder:1.5b",
        includeFileContext: false,
        includeScopeInfo: false,
      });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
        "qwen2.5-coder:1.5b",
        "rnj-1",
      );

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
      const prefix = (call[1] as any).prefix;

      // Should NOT include context markers
      expect(prefix).not.toContain("<|file_context|>");
      // Should just have the immediate prefix
      expect(prefix).toContain("const x =");
    });

    it("includes scope info when enabled", async () => {
      setMockConfig({
        enabled: true,
        model: "qwen2.5-coder:1.5b",
        includeFileContext: false,
        includeScopeInfo: true,
      });
      const provider = new FimCompletionProvider(
        "http://localhost:11434",
        "qwen2.5-coder:1.5b",
        "rnj-1",
      );

      const code = `class MyClass {
  constructor() {
    this.value = 0;
  }
  
  calculate() {
    return 
  }
}`;

      await provider.provideInlineCompletionItems(
        makeDocument(code, 6, 11, "example.ts", "typescript") as any,
        makePosition(6, 11) as any,
        {} as any,
        makeToken() as any,
      );

      const call = vi.mocked(fetchGenerate).mock.calls[0];
      const prefix = (call[1] as any).prefix;

      // Should include scope hint
      expect(prefix).toContain("// Currently in:");
    });
  });
});
