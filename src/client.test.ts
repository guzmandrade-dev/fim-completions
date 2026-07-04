import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGenerate, buildFimPrompt, defaultApiPath } from "./client.js";

const fetchMock = vi.fn();

describe("client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  describe("defaultApiPath", () => {
    it("returns /api/generate for ollama", () => {
      expect(defaultApiPath("ollama")).toBe("/api/generate");
    });

    it("returns /v1/completions for openai", () => {
      expect(defaultApiPath("openai")).toBe("/v1/completions");
    });
  });

  describe("buildFimPrompt", () => {
    it("formats qwen FIM prompt", () => {
      expect(buildFimPrompt("prefix", "suffix", "qwen")).toBe(
        "<|fim_prefix|>prefix<|fim_suffix|>suffix<|fim_middle|>",
      );
    });

    it("formats deepseek FIM prompt", () => {
      expect(buildFimPrompt("prefix", "suffix", "deepseek")).toBe(
        "<|fim_begin|>prefix<|fim_hole|>suffix<|fim_end|>",
      );
    });

    it("formats gemma FIM prompt", () => {
      expect(buildFimPrompt("prefix", "suffix", "gemma")).toBe(
        "<|fim_prefix|>prefix<|fim_middle|>suffix<|fim_suffix|>",
      );
    });

    it("formats mistral SPM prompt", () => {
      expect(buildFimPrompt("prefix", "suffix", "mistral")).toBe(
        "<s>[SUFFIX]suffix[PREFIX]prefix",
      );
    });

    it("formats ministral SPM prompt", () => {
      expect(buildFimPrompt("prefix", "suffix", "ministral")).toBe(
        "<s>[SUFFIX]suffix[PREFIX]prefix",
      );
    });
  });

  describe("fetchGenerate ollama backend", () => {
    it("sends raw mode for qwen", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "completion" }),
      } as Response);

      await fetchGenerate(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        {
          model: "qwen2.5-coder:3b",
          prefix: "pre",
          suffix: "suf",
          modelType: "qwen",
          options: { num_predict: 64, temperature: 0.1 },
        },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init!.body as string);
      expect(body.raw).toBe(true);
      expect(body.prompt).toBe(
        "<|fim_prefix|>pre<|fim_suffix|>suf<|fim_middle|>",
      );
    });

    it("adds system instruction for non-raw ministral", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "completion" }),
      } as Response);

      await fetchGenerate(
        "http://localhost:11434",
        "/api/generate",
        "ollama",
        {
          model: "ministral-3b-latest",
          prefix: "pre",
          suffix: "suf",
          modelType: "ministral",
        },
      );

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init!.body as string);
      expect(body.raw).toBeUndefined();
      expect(body.system).toContain("code completion assistant");
    });
  });

  describe("fetchGenerate openai backend", () => {
    it("sends OpenAI-style completions payload", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ text: "completion" }],
        }),
      } as Response);

      const result = await fetchGenerate(
        "https://api.together.ai/v1",
        "/completions",
        "openai",
        {
          model: "Qwen/Qwen2.5-Coder-7B-Instruct",
          prefix: "pre",
          suffix: "suf",
          modelType: "qwen",
          options: { max_tokens: 64, temperature: 0.1 },
        },
      );

      expect(result.response).toBe("completion");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.together.ai/v1/completions");
      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe("Qwen/Qwen2.5-Coder-7B-Instruct");
      expect(body.max_tokens).toBe(64);
      expect(body.prompt).toContain("<|fim_prefix|>");
    });

    it("falls back to message content", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "chat completion" } }],
        }),
      } as Response);

      const result = await fetchGenerate(
        "https://api.openai.com/v1",
        "/v1/completions",
        "openai",
        {
          model: "gpt-4",
          prefix: "pre",
          modelType: "qwen",
        },
      );

      expect(result.response).toBe("chat completion");
    });

    it("throws on missing choices", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
      } as Response);

      await expect(
        fetchGenerate(
          "https://api.openai.com/v1",
          "/v1/completions",
          "openai",
          {
            model: "gpt-4",
            prefix: "pre",
            modelType: "qwen",
          },
        ),
      ).rejects.toThrow("Unexpected response shape");
    });

    it("throws on HTTP error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "bad key",
      } as Response);

      await expect(
        fetchGenerate(
          "https://api.openai.com/v1",
          "/v1/completions",
          "openai",
          {
            model: "gpt-4",
            prefix: "pre",
            modelType: "qwen",
          },
        ),
      ).rejects.toThrow("401");
    });
  });
});
