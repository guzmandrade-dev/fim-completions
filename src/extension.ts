import * as vscode from 'vscode';
import { FimCompletionProvider } from './completions.js';
import { getSetting } from './settings.js';

export function activate(context: vscode.ExtensionContext): void {
  const enabled = getSetting<boolean>('enabled', true);
  const model = getSetting<string>('model', '');
  const apiUrl = getSetting<string>('apiUrl', 'http://localhost:11434');

  if (!enabled || !model) return;

  const provider = new FimCompletionProvider(apiUrl, model);

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider,
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
