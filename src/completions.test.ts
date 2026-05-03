import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMockConfig } from './test/vscode.mock.js';
import { FimCompletionProvider } from './completions.js';
import { fetchGenerate } from './client.js';

vi.mock('./client.js', () => ({
  fetchGenerate: vi.fn(),
}));

describe('FimCompletionProvider', () => {
  beforeEach(() => {
    vi.mocked(fetchGenerate).mockResolvedValue({ response: 'const x = 1;' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    setMockConfig({});
  });

  function makeToken(isCancellationRequested = false) {
    return { isCancellationRequested };
  }

  function makeDocument(text: string, offset: number) {
    const positionAt = (off: number) => new (class {
      constructor(public readonly _off: number) {}
    })(Math.min(Math.max(0, off), text.length));

    return {
      getText: (range?: unknown) => {
        if (!range) return text;
        const r = range as { start: { _off?: number }; end: { _off?: number } };
        const start = r.start._off ?? offset;
        const end = r.end._off ?? offset;
        return text.slice(start, end);
      },
      offsetAt: (pos: unknown) => {
        if (typeof pos === 'object' && pos !== null) {
          if ('_off' in (pos as object)) return (pos as { _off: number })._off;
          if ('character' in (pos as object) && (pos as { character: number }).character === Number.MAX_SAFE_INTEGER)
            return text.length;
        }
        return offset;
      },
      positionAt,
      lineCount: text.split('\n').length || 1,
    };
  }

  it('returns null when enabled is false', async () => {
    setMockConfig({ enabled: false, model: 'llama3.2' });
    const provider = new FimCompletionProvider('http://localhost:11434', 'llama3.2');
    const result = await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  it('returns null when model is empty string', async () => {
    setMockConfig({ enabled: true, model: '' });
    const provider = new FimCompletionProvider('http://localhost:11434', '');
    const result = await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  it('returns null when model is whitespace', async () => {
    setMockConfig({ enabled: true, model: '   ' });
    const provider = new FimCompletionProvider('http://localhost:11434', '   ');
    const result = await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });

  it('calls fetchGenerate with correct prefix and suffix', async () => {
    setMockConfig({ enabled: true, model: 'qwen2.5-coder:1.5b' });
    const provider = new FimCompletionProvider('http://localhost:11434', 'qwen2.5-coder:1.5b');

    const text = 'hello world';
    const offset = 5;
    const result = await provider.provideInlineCompletionItems(
      makeDocument(text, offset) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      'http://localhost:11434',
      expect.objectContaining({
        model: 'qwen2.5-coder:1.5b',
        prompt: 'hello',
        suffix: ' world',
        stream: false,
      }),
      undefined,
    );

    expect(result).toHaveLength(1);
    expect((result![0] as any).insertText).toBe('const x = 1;');
  });

  it('sends apiKey to fetchGenerate when set', async () => {
    setMockConfig({ enabled: true, model: 'qwen2.5-coder:1.5b', apiKey: 'secret-token' });
    const provider = new FimCompletionProvider('http://localhost:11434', 'qwen2.5-coder:1.5b');

    await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      'http://localhost:11434',
      expect.any(Object),
      'secret-token',
    );
  });

  it('uses custom maxTokens when set', async () => {
    setMockConfig({ enabled: true, model: 'qwen2.5-coder:1.5b', maxTokens: 256 });
    const provider = new FimCompletionProvider('http://localhost:11434', 'qwen2.5-coder:1.5b');

    await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(fetchGenerate).toHaveBeenCalledTimes(1);
    expect(fetchGenerate).toHaveBeenCalledWith(
      'http://localhost:11434',
      expect.objectContaining({
        options: expect.objectContaining({ num_predict: 256 }),
      }),
      undefined,
    );
  });

  it('returns null when token is already cancelled', async () => {
    setMockConfig({ enabled: true, model: 'qwen2.5-coder:1.5b' });
    const provider = new FimCompletionProvider('http://localhost:11434', 'qwen2.5-coder:1.5b');
    const result = await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken(true) as any,
    );

    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    vi.mocked(fetchGenerate).mockRejectedValue(new Error('ECONNREFUSED'));

    setMockConfig({ enabled: true, model: 'qwen2.5-coder:1.5b' });
    const provider = new FimCompletionProvider('http://localhost:11434', 'qwen2.5-coder:1.5b');
    const result = await provider.provideInlineCompletionItems(
      makeDocument('hello', 5) as any,
      {} as any,
      {} as any,
      makeToken() as any,
    );

    expect(result).toBeNull();
  });
});
