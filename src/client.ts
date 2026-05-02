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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}
