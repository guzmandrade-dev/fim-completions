import * as vscode from 'vscode';

const API_KEY_SECRET_KEY = 'fim.apiKey';

/**
 * Gets the API key with the following priority:
 * 1. Environment variable OLLAMA_API_KEY
 * 2. VS Code secret storage (can override env var when set)
 *
 * To allow users to override the env var via VS Code secret, we check if a secret
 * is explicitly set. If the secret is set to an empty string, it acts as an override
 * to disable using the env var.
 */
export async function getApiKey(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
  // Check if there's a VS Code secret set (including empty string to override env var)
  const secretKey = await secretStorage.get(API_KEY_SECRET_KEY);

  // If secret is explicitly set (even if empty), use it
  if (secretKey !== undefined) {
    return secretKey || undefined;
  }

  // Otherwise, fall back to environment variable
  return process.env.OLLAMA_API_KEY;
}

/**
 * Stores an API key in VS Code secret storage.
 * Setting an empty string will override the env var and disable API key usage.
 */
export async function setApiKey(secretStorage: vscode.SecretStorage, apiKey: string): Promise<void> {
  await secretStorage.store(API_KEY_SECRET_KEY, apiKey);
}

/**
 * Clears the API key from VS Code secret storage.
 * After clearing, the env var will be used again.
 */
export async function clearApiKey(secretStorage: vscode.SecretStorage): Promise<void> {
  await secretStorage.delete(API_KEY_SECRET_KEY);
}
