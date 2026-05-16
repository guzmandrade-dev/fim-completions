import { Ollama } from "ollama";

export type FimModelType = "rnj-1" | "deepseek" | "qwen" | "gemma" | "mistral";

interface GenerateRequest {
  model: string;
  prefix: string;
  suffix?: string;
  modelType?: FimModelType;
  options?: {
    num_predict?: number;
    temperature?: number;
    stop?: string[];
  };
}

interface GenerateResponse {
  response: string;
}

// FIM token configurations for different model families
const FIM_TOKENS: Record<
  FimModelType,
  { pre: string; suf: string; mid: string }
> = {
  "rnj-1": {
    pre: "<|pre_fim|>",
    suf: "<|suf_fim|>",
    mid: "<|mid_fim|>",
  },
  deepseek: {
    pre: "<|fim_begin|>",
    suf: "<|fim_hole|>",
    mid: "<|fim_end|>",
  },
  qwen: {
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
  },
  gemma: {
    pre: "<|fim_prefix|>",
    mid: "<|fim_middle|>",
    suf: "<|fim_suffix|>",
  },
  mistral: {
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
  },
};

// Default stop tokens that work across models
const DEFAULT_STOP_TOKENS = [
  "\n\n",
  "```",
  "<|endoftext|>",
  "// Note:",
  "// Notes:",
  "/* Note:",
  "/* Notes:",
  "# Note:",
  "# Notes:",
];

function buildFimPrompt(
  prefix: string,
  suffix: string | undefined,
  modelType: FimModelType,
): string {
  const tokens = FIM_TOKENS[modelType];

  if (modelType === "gemma") {
    // Gemma format: <|fim_prefix|>prefix<|fim_middle|>suffix<|fim_suffix|>
    // The model generates between <|fim_middle|> and <|fim_suffix|>
    if (suffix && suffix.trim()) {
      return `${tokens.pre}${prefix}${tokens.mid}${suffix}${tokens.suf}`;
    }
    // No suffix provided
    return `${tokens.pre}${prefix}${tokens.mid}`;
  }

  // Standard format for rnj-1, deepseek, qwen, mistral: <pre>prefix<suf>suffix<mid>
  if (suffix && suffix.trim()) {
    return `${tokens.pre}${prefix}${tokens.suf}${suffix}${tokens.mid}`;
  }
  // No suffix provided, just use prefix with mid token
  return `${tokens.pre}${prefix}${tokens.mid}`;
}

function getModelSpecificStopTokens(modelType: FimModelType): string[] {
  const tokens = FIM_TOKENS[modelType];
  return [tokens.pre, tokens.suf, tokens.mid];
}

export async function fetchGenerate(
  baseUrl: string,
  req: GenerateRequest,
  apiKey?: string,
): Promise<GenerateResponse> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const host = baseUrl.trim();
  console.log(`[FIM] Ollama host: ${host}`);

  const ollama = new Ollama({
    host,
    headers,
  });

  // Use the specified model type or default to rnj-1
  const modelType = req.modelType ?? "rnj-1";

  // Build FIM-formatted prompt based on model type
  const prompt = buildFimPrompt(req.prefix, req.suffix, modelType);

  // Combine default stop tokens with model-specific tokens
  const modelStopTokens = getModelSpecificStopTokens(modelType);
  const stopTokens = [...modelStopTokens, ...DEFAULT_STOP_TOKENS];

  const generateReq = {
    model: req.model,
    prompt,
    stream: false as const,
    options: {
      ...req.options,
      stop: stopTokens,
    },
  };
  console.log(`[Ollama FIM] generating completion for model: ${generateReq.model}`);

  const response = await ollama.generate(generateReq);

  return { response: response.response };
}
