import type {
  CancellationToken,
  InlineCompletionContext,
  InlineCompletionItemProvider,
  TextDocument,
  SecretStorage,
} from "vscode";
import { InlineCompletionItem, Position, Range } from "vscode";
import { fetchGenerate, type FimModelType } from "./client.js";
import { getSetting } from "./settings.js";
import { getApiKey } from "./secrets.js";

const MAX_PREFIX_CHARS = 2000;
const MAX_SUFFIX_CHARS = 500;

export class FimCompletionProvider implements InlineCompletionItemProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly model: string,
    private readonly modelType: FimModelType = "rnj-1",
    private readonly secretStorage: SecretStorage,
  ) {}

  async provideInlineCompletionItems(
    document: TextDocument,
    position: Position,
    _context: InlineCompletionContext,
    token: CancellationToken,
  ): Promise<InlineCompletionItem[] | null> {
    if (token.isCancellationRequested) return null;

    const enabled = getSetting<boolean>("enabled", true);
    if (!enabled) return null;

    const offset = document.offsetAt(position);
    const prefixStart = Math.max(0, offset - MAX_PREFIX_CHARS);
    const prefix = document.getText(
      new Range(document.positionAt(prefixStart), position),
    );

    const docEnd = document.offsetAt(
      new Position(document.lineCount - 1, Number.MAX_SAFE_INTEGER),
    );
    const suffixEnd = Math.min(docEnd, offset + MAX_SUFFIX_CHARS);
    const suffix = document.getText(
      new Range(position, document.positionAt(suffixEnd)),
    );

    // Skip completions when there's insufficient context
    const MIN_PREFIX_CHARS = 10;
    const trimmedPrefix = prefix.trim();
    const trimmedSuffix = suffix.trim();

    // Don't complete if prefix is too short and there's no suffix (empty/early file)
    if (trimmedPrefix.length < MIN_PREFIX_CHARS && trimmedSuffix.length === 0) {
      return null;
    }

    // Don't complete if we're at the very end of an empty/new file
    if (trimmedPrefix.length === 0 && trimmedSuffix.length === 0) {
      return null;
    }

    // Don't complete if current line only has whitespace and nothing ahead (just pressed ENTER + SPACE)
    // Get text from start of line to cursor
    const lineStart = new Position(position.line, 0);
    const linePrefix = document.getText(new Range(lineStart, position));
    if (linePrefix.trim().length === 0 && trimmedSuffix.length === 0) {
      return null;
    }

    const maxTokens = getSetting<number>("maxTokens", 128);

    try {
      const apiKey = (await getApiKey(this.secretStorage))?.trim();
      const response = await fetchGenerate(
        this.apiUrl,
        {
          model: this.model,
          prefix,
          suffix: suffix.length > 0 ? suffix : undefined,
          modelType: this.modelType,
          options: { num_predict: maxTokens, temperature: 0.1 },
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
