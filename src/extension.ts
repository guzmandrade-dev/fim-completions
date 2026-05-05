import * as vscode from 'vscode';
import { FimCompletionProvider } from './completions.js';
import { getSetting } from './settings.js';

// Fixed rnj-1 model identifier for Ollama
const RNJ1_MODEL = 'rnj-1:8b-cloud';

export function activate(context: vscode.ExtensionContext): void {
  const enabled = getSetting<boolean>('enabled', true);
  const apiUrl = getSetting<string>('apiUrl', 'http://localhost:11434');

  if (!enabled) return;

  const provider = new FimCompletionProvider(apiUrl, RNJ1_MODEL);

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider,
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
