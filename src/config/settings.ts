/**
 * Settings / Configuration Manager
 *
 * Persists user preferences (providers, model, session title) to
 * ~/.config/koi/settings.json.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { getProviders, getModels, completeSimple, type KnownProvider, type Model, type Api } from "@mariozechner/pi-ai";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";

export interface ModelRef {
  provider: string;
  modelId: string;
}

export type AuthMethod = "apikey" | "oauth";

export interface ProviderConfig {
  provider: string;
  authMethod: AuthMethod;
  credential: string; // api key or oauth token
}

interface SettingsFile {
  version: number;
  sessionTitle: string;
  providers: Record<string, ProviderConfig>;
  currentModel: ModelRef | null;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");

let sessionTitle = "New Session";
let providerConfigs = new Map<string, ProviderConfig>();
let currentModel: ModelRef | null = null;

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function saveSettings(): void {
  try {
    ensureConfigDir();
    const data: SettingsFile = {
      version: 1,
      sessionTitle,
      providers: Object.fromEntries(providerConfigs),
      currentModel,
    };
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(SETTINGS_PATH, json + "\n", { mode: 0o600 });
    fs.chmodSync(SETTINGS_PATH, 0o600);
  } catch {
    // Silently ignore write errors so the TUI never crashes on save.
  }
}

export function loadSettings(): void {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return;
    }
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const data = JSON.parse(raw) as SettingsFile;

    if (data.sessionTitle) {
      sessionTitle = data.sessionTitle;
    }
    if (data.providers) {
      providerConfigs = new Map(Object.entries(data.providers));
    }
    if (data.currentModel) {
      currentModel = data.currentModel;
    }
  } catch {
    // If the file is missing, corrupt, or unreadable, start fresh.
  }
}

export function getSessionTitle(): string {
  return sessionTitle;
}

export function setSessionTitle(title: string): void {
  sessionTitle = title;
  saveSettings();
}

export function configureProvider(config: ProviderConfig): void {
  providerConfigs.set(config.provider, config);
  saveSettings();
}

export function removeProvider(provider: string): void {
  providerConfigs.delete(provider);
  saveSettings();
}

export function isProviderConfigured(provider: string): boolean {
  return providerConfigs.has(provider);
}

export function getProviderConfig(provider: string): ProviderConfig | undefined {
  return providerConfigs.get(provider);
}

export function getConfiguredProviders(): string[] {
  return Array.from(providerConfigs.keys());
}

export function getCurrentModel(): ModelRef | null {
  return currentModel;
}

export function setCurrentModel(ref: ModelRef | null): void {
  currentModel = ref;
  saveSettings();
}

export function getAllProviders(): string[] {
  return getProviders();
}

export function getProviderModels(provider: string): Model<Api>[] {
  return getModels(provider as KnownProvider);
}

export async function validateProviderCredential(
  provider: string,
  credential: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    let models = getModels(provider as KnownProvider);
    if (!models || models.length === 0) {
      return { valid: false, error: "No models available for this provider" };
    }

    let model: Model<Api> = models[0]!;
    let apiKey = credential;

    const oauthProvider = getOAuthProvider(provider);
    if (oauthProvider) {
      const fakeCreds = {
        access: credential,
        refresh: credential,
        expires: Date.now() + 86400000,
      };
      apiKey = oauthProvider.getApiKey(fakeCreds);
      if (oauthProvider.modifyModels) {
        const modified = oauthProvider.modifyModels(models, fakeCreds);
        if (modified.length > 0) {
          model = modified[0]!;
        }
      }
    }

    const message = await completeSimple(
      model,
      {
        messages: [{ role: "user", content: "Hi", timestamp: Date.now() }],
      },
      {
        apiKey,
        maxTokens: 1,
        maxRetries: 0,
        timeoutMs: 15000,
      }
    );

    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return {
        valid: false,
        error: message.errorMessage || "API request failed",
      };
    }

    return { valid: true };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    return { valid: false, error: msg };
  }
}
