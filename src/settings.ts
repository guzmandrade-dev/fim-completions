import * as vscode from 'vscode';

const NS = 'fim';

export function getSetting<T>(key: string, defaultValue?: T): T | undefined {
  return vscode.workspace.getConfiguration(NS).get<T>(key) ?? defaultValue;
}
