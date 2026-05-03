import type { CancellationToken, InlineCompletionContext, InlineCompletionItemProvider, TextDocument } from 'vscode';
import { InlineCompletionItem, Position, Range } from 'vscode';
import { fetchGenerate } from './client.js';
import { getSetting } from './settings.js';

export const MAX_PREFIX_CHARS = 2000;
export const MAX_SUFFIX_CHARS = 500;

export class FimCompletionProvider implements InlineCompletionItemProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly model: string,
  ) {}

  async provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    _context: InlineCompletionContext,
    token: CancellationToken,
  ): Promise<InlineCompletionItem[] | null> {
    if (token.isCancellationRequested) return null;

    const enabled = getSetting<boolean>('enabled', true);
    if (!enabled) return null;

    const model = this.model.trim();
    if (!model) return null;

    const offset = document.offsetAt(position);
    const prefixStart = Math.max(0, offset - MAX_PREFIX_CHARS);
    const prefix = document.getText(new Range(document.positionAt(prefixStart), position));

    const docEnd = document.offsetAt(new Position(document.lineCount - 1, Number.MAX_SAFE_INTEGER));
    const suffixEnd = Math.min(docEnd, offset + MAX_SUFFIX_CHARS);
    const suffix = document.getText(new Range(position, document.positionAt(suffixEnd)));

    const apiKey = getSetting<string>('apiKey', '')?.trim() ?? '';
    const maxTokens = getSetting<number>('maxTokens', 128);

    try {
      const response = await fetchGenerate(
        this.apiUrl,
        {
          model,
          prompt: prefix,
          suffix: suffix.length > 0 ? suffix : undefined,
          stream: false,
          options: { num_predict: maxTokens, temperature: 0.1, stop: ['\n\n'] },
        },
        apiKey || undefined,
      );

      if (token.isCancellationRequested) return null;

      const text = response.response;
      if (!text?.trim()) return null;

      return [new InlineCompletionItem(text)];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FIM] inline completion failed: ${message}`);
      return null;
    }
  }
}
