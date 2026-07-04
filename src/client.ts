export type Backend = "ollama" | "openai";
export type FimModelType =
  | "rnj-1"
  | "deepseek"
  | "qwen"
  | "gemma"
  | "mistral"
  | "ministral";

interface GenerateRequest {
  model: string;
  prefix: string;
  suffix?: string;
  modelType?: FimModelType;
  options?: {
    num_predict?: number;
    max_tokens?: number;
    temperature?: number;
    stop?: string[];
    seed?: number;
  };
}

interface OllamaGenerateResponse {
  response: string;
}

interface OpenAiCompletionResponse {
  choices?: Array<{
    text?: string;
    message?: { content?: string };
  }>;
}

interface GenerateResponse {
  response: string;
}

interface TokenConfig {
  pre: string;
  suf: string;
  mid: string;
  raw?: boolean;
  bos?: string;
}

// FIM token configurations for different model families.
// `raw: true` means the model natively understands the FIM delimiters and
// should be called in Ollama raw mode (or via an OpenAI completions endpoint).
const FIM_TOKENS: Record<FimModelType, TokenConfig> = {
  "rnj-1": {
    pre: "<|pre_fim|>",
    suf: "<|suf_fim|>",
    mid: "<|mid_fim|>",
    raw: true,
  },
  deepseek: {
    pre: "<|fim_begin|>",
    suf: "<|fim_hole|>",
    mid: "<|fim_end|>",
    raw: true,
  },
  qwen: {
    pre: "<|fim_prefix|>",
    suf: "<|fim_suffix|>",
    mid: "<|fim_middle|>",
    raw: true,
  },
  gemma: {
    pre: "<|fim_prefix|>",
    mid: "<|fim_middle|>",
    suf: "<|fim_suffix|>",
  },
  mistral: {
    // Codestral SPM format
    pre: "[PREFIX]",
    suf: "[SUFFIX]",
    mid: "",
    bos: "<s>",
    raw: true,
  },
  ministral: {
    // Ministral uses the same SPM placeholders but requires an instruction
    // fallback on Ollama because raw mode is not available.
    pre: "[PREFIX]",
    suf: "[SUFFIX]",
    mid: "",
    bos: "<s>",
    raw: false,
  },
};

// Stop tokens that cut off chat-style or markdown artifacts. These are safe
// across all model families and backends.
const DEFAULT_STOP_TOKENS = [
  "\n\n",
  "```",
  "<|endoftext|>",
  "<|file_context|>",
  "<|end_file_context|>",
  "// Currently in:",
  "// Note:",
  "// Notes:",
  "/* Note:",
  "/* Notes:",
  "# Note:",
  "# Notes:",
  "Here is",
  "Certainly!",
  "Below is",
];

const CHAT_TEMPLATE_INSTRUCTION =
  "You are a code completion assistant. The user gives you a code file with a " +
  "cursor gap marked by FIM tokens. Complete only the missing code between the " +
  "existing prefix and suffix. Output raw code only, no markdown, no " +
  "explanations, no comments like 'Here is'.";

export function defaultApiPath(backend: Backend): string {
  return backend === "openai" ? "/v1/completions" : "/api/generate";
}

export function buildFimPrompt(
  prefix: string,
  suffix: string | undefined,
  modelType: FimModelType,
): string {
  const tokens = FIM_TOKENS[modelType];
  const hasSuffix = !!suffix && suffix.trim().length > 0;

  if (modelType === "gemma") {
    // Gemma format: <|fim_prefix|>prefix<|fim_middle|>suffix<|fim_suffix|>
    // The model generates between <|fim_middle|> and <|fim_suffix|>
    if (hasSuffix) {
      return `${tokens.pre}${prefix}${tokens.mid}${suffix}${tokens.suf}`;
    }
    return `${tokens.pre}${prefix}${tokens.mid}`;
  }

  if (modelType === "mistral" || modelType === "ministral") {
    // Codestral / Ministral SPM format:
    // <s>[SUFFIX]suffix[PREFIX]prefix
    const bos = tokens.bos ?? "<s>";
    if (hasSuffix) {
      return `${bos}${tokens.suf}${suffix}${tokens.pre}${prefix}`;
    }
    return `${bos}${tokens.pre}${prefix}`;
  }

  // Standard format for rnj-1, deepseek, qwen:
  // <|pre_fim|>prefix<|suf_fim|>suffix<|mid_fim|>
  if (hasSuffix) {
    return `${tokens.pre}${prefix}${tokens.suf}${suffix}${tokens.mid}`;
  }
  return `${tokens.pre}${prefix}${tokens.mid}`;
}

function getModelSpecificStopTokens(modelType: FimModelType): string[] {
  const tokens = FIM_TOKENS[modelType];
  const stops: string[] = [];
  if (tokens.pre) stops.push(tokens.pre);
  if (tokens.suf) stops.push(tokens.suf);
  if (tokens.mid) stops.push(tokens.mid);
  if (tokens.bos && !stops.includes(tokens.bos)) stops.push(tokens.bos);
  return stops;
}

export function getStopTokens(
  modelType: FimModelType,
  backend: Backend,
): string[] {
  const tokens = FIM_TOKENS[modelType];
  const raw = tokens.raw ?? false;

  // For raw mode or the OpenAI completions endpoint the FIM delimiter tokens
  // are part of the input format, so adding them as stop tokens can do more
  // harm than good. Use only the generic chat/markdown/notes stops.
  if (backend === "openai" || raw) {
    return [...DEFAULT_STOP_TOKENS];
  }

  // For non-raw Ollama backend we also stop on the FIM delimiters to prevent
  // the chat-templated model from emitting them or running past the gap.
  return [...getModelSpecificStopTokens(modelType), ...DEFAULT_STOP_TOKENS];
}

export async function fetchGenerate(
  baseUrl: string,
  apiPath: string,
  backend: Backend,
  req: GenerateRequest,
  apiKey?: string,
): Promise<GenerateResponse> {
  const host = baseUrl.trim().replace(/\/$/, "");
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const url = `${host}${path}`;

  const modelType = req.modelType ?? "qwen";
  const tokens = FIM_TOKENS[modelType];
  const raw = tokens.raw ?? false;

  const hasSuffix = !!req.suffix && req.suffix.trim().length > 0;
  const fimPrompt = buildFimPrompt(req.prefix, req.suffix, modelType);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const seed = req.options?.seed ?? Math.floor(Math.random() * 1_000_000);

  let body: Record<string, unknown>;

  if (backend === "openai") {
    body = {
      model: req.model,
      prompt: fimPrompt,
      max_tokens: req.options?.max_tokens ?? req.options?.num_predict ?? 64,
      temperature: req.options?.temperature ?? 0.1,
      stop: getStopTokens(modelType, backend),
      seed,
    };
    if (hasSuffix) {
      body.suffix = req.suffix;
    }
  } else {
    // Ollama native /api/generate
    const options: Record<string, unknown> = {
      num_predict: req.options?.num_predict ?? 64,
      temperature: req.options?.temperature ?? 0.1,
      stop: getStopTokens(modelType, backend),
      seed,
    };

    body = {
      model: req.model,
      prompt: fimPrompt,
      stream: false,
      options,
    };

    if (raw) {
      // raw mode bypasses the model's chat template so FIM delimiters are
      // treated literally.
      body.raw = true;
    }

    if (!raw && (modelType === "mistral" || modelType === "ministral")) {
      // Non-raw mistral/ministral still needs the instruction prefix to avoid
      // chat-style responses.
      body.system = CHAT_TEMPLATE_INSTRUCTION;
    }
  }

  console.log(`[FIM] ${backend} request to ${url} for model ${req.model}`);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${backend} request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
    );
  }

  const json = (await response.json()) as
    | OllamaGenerateResponse
    | OpenAiCompletionResponse;

  let completionText: string | undefined;

  if (backend === "openai") {
    const openAiResp = json as OpenAiCompletionResponse;
    const choices = openAiResp.choices ?? [];
    if (choices.length > 0) {
      const choice = choices[0];
      if (choice.message && typeof choice.message.content === "string") {
        completionText = choice.message.content;
      } else if (typeof choice.text === "string") {
        completionText = choice.text;
      }
    }
  } else {
    completionText = (json as OllamaGenerateResponse).response;
  }

  if (typeof completionText !== "string") {
    throw new Error(`Unexpected response shape from ${backend} endpoint`);
  }

  return { response: completionText };
}
