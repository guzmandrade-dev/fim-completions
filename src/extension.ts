import * as vscode from "vscode";
import { FimCompletionProvider } from "./completions.js";
import { getSetting } from "./settings.js";
import type { FimModelType } from "./client.js";

// Default model configurations
const DEFAULT_MODEL_CONFIGS: Record<FimModelType, { modelId: string }> = {
  "rnj-1": { modelId: "rnj-1:8b-cloud" },
  deepseek: { modelId: "deepseek-coder-v2:lite-instruct" },
  qwen: { modelId: "qwen3-coder-next:latest" },
  gemma: { modelId: "gemma3:latest" },
  mistral: { modelId: "codestral:latest" },
};

export function activate(context: vscode.ExtensionContext): void {
  const enabled = getSetting<boolean>("enabled", true);
  const apiUrl = getSetting<string>("apiUrl", "http://localhost:11434");
  const modelType = getSetting<FimModelType>("model", "rnj-1") ?? "rnj-1";

  // Get the model ID - use custom if provided, otherwise use default for the model type
  let modelId = getSetting<string>("modelId", "");
  if (!modelId) {
    modelId = DEFAULT_MODEL_CONFIGS[modelType].modelId;
  }

  if (!enabled) return;

  const provider = new FimCompletionProvider(apiUrl, modelId, modelType);

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    provider,
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
