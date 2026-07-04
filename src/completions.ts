import type {
  CancellationToken,
  InlineCompletionContext,
  InlineCompletionItemProvider,
  TextDocument,
  SecretStorage,
} from "vscode";
import { InlineCompletionItem, Position, Range } from "vscode";
import {
  fetchGenerate,
  type FimModelType,
  type Backend,
  defaultApiPath,
} from "./client.js";
import { getSetting } from "./settings.js";
import { getApiKey } from "./secrets.js";
import {
  extractFileContext,
  formatFileContext,
  extractCurrentScope,
} from "./context.js";

// Conservative context windows ported from the Vim plugin. Smaller windows mean
// lower latency, lower memory use, and more deterministic completions on local
// models.
const MAX_PREFIX_CHARS = 200;
const MAX_SUFFIX_CHARS = 50;

export class FimCompletionProvider implements InlineCompletionItemProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiPath: string,
    private readonly backend: Backend,
    private readonly model: string,
    private readonly modelType: FimModelType = "qwen",
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

    const includeFileContext = getSetting<boolean>("includeFileContext", false);
    const includeScopeInfo = getSetting<boolean>("includeScopeInfo", false);
    const fileContextChars = getSetting<number>("fileContextChars", 500);

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

    let enrichedPrefix = prefix;

    // Add file-level context if enabled
    if (includeFileContext) {
      const fileContext = extractFileContext(document, position, fileContextChars);
      const formattedContext = formatFileContext(
        fileContext,
        document.fileName.split("/").pop() || "untitled",
        document.languageId,
      );
      enrichedPrefix = formattedContext + enrichedPrefix;
    }

    // Add scope information only when file context is also enabled. The scope
    // hint is useless without the surrounding file context, and sending both
    // keeps the prompt short by default.
    if (includeScopeInfo && includeFileContext) {
      const currentScope = extractCurrentScope(document, position);
      if (currentScope) {
        enrichedPrefix = `// Currently in: ${currentScope}\n${enrichedPrefix}`;
      }
    }

    const maxTokens = getSetting<number>("maxTokens", 64);

    try {
      const apiKey = (await getApiKey(this.secretStorage))?.trim();
      const response = await fetchGenerate(
        this.apiUrl,
        this.apiPath,
        this.backend,
        {
          model: this.model,
          prefix: enrichedPrefix,
          suffix: suffix.length > 0 ? suffix : undefined,
          modelType: this.modelType,
          options: { num_predict: maxTokens, max_tokens: maxTokens, temperature: 0.1 },
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
