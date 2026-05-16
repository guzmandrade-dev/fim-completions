import * as vscode from "vscode";
import { FimCompletionProvider } from "./completions.js";
import { getSetting } from "./settings.js";
import { setApiKey, clearApiKey } from "./secrets.js";
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

  const provider = new FimCompletionProvider(
    apiUrl ?? "http://localhost:11434",
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
        ? "Enter API key for Ollama FIM (press Enter without typing to use environment variable OLLAMA_API_KEY):"
        : "Enter API key for Ollama FIM:";

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
            ? "Ollama FIM: API key has been set."
            : "Ollama FIM: Using OLLAMA_API_KEY from environment.",
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
        "Ollama FIM: API key has been cleared. Using OLLAMA_API_KEY from environment if available.",
      );
    },
  );

  context.subscriptions.push(setApiKeyCommand, clearApiKeyCommand);
}

export function deactivate(): void {}
