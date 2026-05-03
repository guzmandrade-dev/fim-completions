import { Ollama } from 'ollama';

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

  const generateReq = {
    model: req.model,
    prompt: req.prompt,
    suffix: req.suffix,
    stream: false as const,
    options: req.options,
  };
  console.log('[FIM] generate request:', JSON.stringify(generateReq, null, 2));

  const response = await ollama.generate(generateReq);

  return { response: response.response };
}
