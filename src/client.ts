import { Ollama } from 'ollama';

export interface GenerateRequest {
  model: string;
  prefix: string;
  suffix?: string;
  options?: {
    num_predict?: number;
    temperature?: number;
    stop?: string[];
  };
}

export interface GenerateResponse {
  response: string;
}

// FIM tokens for rnj-1 model
const PRE_FIM = '<|pre_fim|>';
const SUF_FIM = '<|suf_fim|>';
const MID_FIM = '<|mid_fim|>';

function buildFimPrompt(prefix: string, suffix?: string): string {
  if (suffix && suffix.trim()) {
    // Full FIM format: <|pre_fim|>prefix<|suf_fim|>suffix<|mid_fim|>
    return `${PRE_FIM}${prefix}${SUF_FIM}${suffix}${MID_FIM}`;
  }
  // No suffix provided, just use prefix with mid token
  return `${PRE_FIM}${prefix}${MID_FIM}`;
}

export async function fetchGenerate(
  baseUrl: string,
  req: GenerateRequest,
  apiKey?: string,
): Promise<GenerateResponse> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const host = baseUrl.trim();
  console.log(`[FIM] Ollama host: ${host}`);

  const ollama = new Ollama({
    host,
    headers,
  });

  // Build FIM-formatted prompt
  const prompt = buildFimPrompt(req.prefix, req.suffix);

  const generateReq = {
    model: req.model,
    prompt,
    stream: false as const,
    options: {
      ...req.options,
      stop: [
        '\n\n',
        '<|suf_fim|>',
        '<|pre_fim|>',
        '<|mid_fim|>',
        '```',
        '<|endoftext|>',
        '// Note:',
        '// Notes:',
        '/* Note:',
        '/* Notes:',
        '# Note:',
        '# Notes:',
      ],
    },
  };
  console.log('[FIM] generate request:', JSON.stringify(generateReq, null, 2));

  const response = await ollama.generate(generateReq);

  return { response: response.response };
}
