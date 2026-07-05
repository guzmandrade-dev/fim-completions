import * as vscode from "vscode";
import { FimCompletionProvider } from "./completions.js";
import { getSetting } from "./settings.js";
import { setApiKey, clearApiKey } from "./secrets.js";
import { defaultApiPath, type Backend, type FimModelType } from "./client.js";

// Default model configurations.
// rnj-1 is kept for users running it locally; it is no longer available on
// Ollama Cloud, so qwen2.5-coder:3b is the default model family.
const DEFAULT_MODEL_CONFIGS: Record<FimModelType, { modelId: string }> = {
  qwen: { modelId: "qwen2.5-coder:3b" },
  deepseek: { modelId: "deepseek-coder-v2:lite-instruct" },
  gemma: { modelId: "gemma3:latest" },
  mistral: { modelId: "codestral:latest" },
  ministral: { modelId: "ministral-3b-latest" },
  "rnj-1": { modelId: "rnj-1:8b-cloud" },
};

export function activate(context: vscode.ExtensionContext): void {
  const enabled = getSetting<boolean>("enabled", true);
  const apiUrl = getSetting<string>("apiUrl", "http://localhost:11434");
  const backend = getSetting<Backend>("backend", "ollama") ?? "ollama";
  const apiPath = getSetting<string>("apiPath", "");
  const modelType = getSetting<FimModelType>("model", "qwen") ?? "qwen";

  // Get the model ID - use custom if provided, otherwise use default for the model type
  let modelId = getSetting<string>("modelId", "");
  if (!modelId) {
    modelId = DEFAULT_MODEL_CONFIGS[modelType].modelId;
  }

  if (!enabled) return;

  const provider = new FimCompletionProvider(
    apiUrl ?? "http://localhost:11434",
    apiPath || defaultApiPath(backend),
    backend,
    modelId,
    modelType,
    context.secrets,
  );

  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    provider,
  );

  context.subscriptions.push(disposable);

  // Register command to set API key
  const setApiKeyCommand = vscode.commands.registerCommand(
    "fim.setApiKey",
    async () => {
      const currentEnvKey = process.env.OLLAMA_API_KEY;
      const promptMessage = currentEnvKey
        ? "Enter API key for your FIM provider (press Enter without typing to use environment variable OLLAMA_API_KEY):"
        : "Enter API key for your FIM provider:";

      const apiKey = await vscode.window.showInputBox({
        prompt: promptMessage,
        password: true,
        placeHolder: currentEnvKey
          ? "(using OLLAMA_API_KEY from environment)"
          : undefined,
      });

      if (apiKey !== undefined) {
        await setApiKey(context.secrets, apiKey);
        vscode.window.showInformationMessage(
          apiKey
            ? "FIM Completions: API key has been set."
            : "FIM Completions: Using OLLAMA_API_KEY from environment.",
        );
      }
    },
  );

  // Register command to clear API key
  const clearApiKeyCommand = vscode.commands.registerCommand(
    "fim.clearApiKey",
    async () => {
      await clearApiKey(context.secrets);
      vscode.window.showInformationMessage(
        "FIM Completions: API key has been cleared. Using OLLAMA_API_KEY from environment if available.",
      );
    },
  );

  context.subscriptions.push(setApiKeyCommand, clearApiKeyCommand);
}

export function deactivate(): void {}
