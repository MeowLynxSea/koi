/**
 * Settings / Configuration Manager
 *
 * Persists user preferences and bridges to Pi infrastructure:
 * - Koi settings: session title, current model reference, provider configs
 * - Pi AuthStorage: credential storage for agent session
 * - Pi ModelRegistry: model discovery and API key resolution
 * - Pi SettingsManager: compaction, retry, and runtime settings
 */

import fs from "fs";
import path from "path";
import os from "os";
import { emitConfigChange } from "../hooks/integrations/configHooks.js";
import {
  getProviders,
  getModels,
  completeSimple,
  type KnownProvider,
  type Model,
  type Api,
} from "@mariozechner/pi-ai";
import { getErrorMessage } from "../tools/types.js";
import { getOAuthProvider } from "@mariozechner/pi-ai/oauth";
import {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

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
  auxiliaryModel?: ModelRef | null;
  externalEditor?: string;
  cceEnabled?: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const SETTINGS_PATH = path.join(CONFIG_DIR, "settings.json");
const PI_AGENT_DIR = path.join(CONFIG_DIR, "pi");

let sessionTitle = "New Session";
let providerConfigs = new Map<string, ProviderConfig>();
let currentModel: ModelRef | null = null;
let auxiliaryModel: ModelRef | null = null;
let externalEditor: string | null = null;
let cceEnabled = false;

// Pi infrastructure (lazy-initialized)
let piAuthStorage: AuthStorage | null = null;
let piModelRegistry: ModelRegistry | null = null;
let piSettingsManager: SettingsManager | null = null;

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(PI_AGENT_DIR)) {
    fs.mkdirSync(PI_AGENT_DIR, { recursive: true, mode: 0o700 });
  }
}

function initPiInfrastructure(): void {
  if (piAuthStorage && piModelRegistry && piSettingsManager) return;
  ensureConfigDir();
  piAuthStorage = AuthStorage.create(path.join(PI_AGENT_DIR, "auth.json"));
  piModelRegistry = ModelRegistry.create(
    piAuthStorage,
    path.join(PI_AGENT_DIR, "models.json")
  );
  piSettingsManager = SettingsManager.create(process.cwd(), PI_AGENT_DIR);
}

function syncCredentialsToPi(): void {
  if (!piAuthStorage) return;
  for (const [provider, config] of providerConfigs) {
    if (config.authMethod === "apikey") {
      piAuthStorage.set(provider, { type: "api_key", key: config.credential });
    } else if (config.authMethod === "oauth") {
      // OAuth tokens from koi settings lack refresh token; store as api_key
      // so ModelRegistry can resolve them without OAuth refresh flow.
      piAuthStorage.set(provider, { type: "api_key", key: config.credential });
    }
  }
}

/* ───────── Pi infrastructure accessors ───────── */

export function getPiAuthStorage(): AuthStorage {
  initPiInfrastructure();
  return piAuthStorage!;
}

export function getPiModelRegistry(): ModelRegistry {
  initPiInfrastructure();
  piModelRegistry!.refresh();
  return piModelRegistry!;
}

export function getPiSettingsManager(): SettingsManager {
  initPiInfrastructure();
  return piSettingsManager!;
}

/* ───────── Pi model resolution ───────── */

export function getCurrentPiModel(): Model<Api> | undefined {
  const ref = getCurrentModel();
  if (!ref) return undefined;
  return getPiModelRegistry().find(ref.provider, ref.modelId);
}

export function getAvailablePiModels(): Model<Api>[] {
  return getPiModelRegistry().getAvailable();
}

export function resolvePiModel(ref: ModelRef): Model<Api> | undefined {
  return getPiModelRegistry().find(ref.provider, ref.modelId);
}

/* ───────── Pi SettingsManager proxies ───────── */

export function getCompactionSettings() {
  return getPiSettingsManager().getCompactionSettings();
}

export function setCompactionEnabled(enabled: boolean) {
  getPiSettingsManager().setCompactionEnabled(enabled);
}

export function getRetrySettings() {
  return getPiSettingsManager().getRetrySettings();
}

export function setRetryEnabled(enabled: boolean) {
  getPiSettingsManager().setRetryEnabled(enabled);
}

/* ───────── Koi settings I/O ───────── */

export function saveSettings(): void {
  try {
    ensureConfigDir();
    const data: SettingsFile = {
      version: 1,
      sessionTitle,
      providers: Object.fromEntries(providerConfigs),
      currentModel,
      auxiliaryModel,
      externalEditor: externalEditor ?? undefined,
      cceEnabled,
    };
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(SETTINGS_PATH, json + "\n", { mode: 0o600 });
    fs.chmodSync(SETTINGS_PATH, 0o600);
  } catch {
    // Silently ignore write errors so the TUI never crashes on save.
  }
}

export function emitConfigChangeIfNeeded(_key: string, _value: unknown): void {
  // Placeholder for ConfigChange hook emission
  // Full implementation would track previous values and emit on change
}

export function loadSettings(): void {
  initPiInfrastructure();

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
    if (data.auxiliaryModel) {
      auxiliaryModel = data.auxiliaryModel;
    }
    if (data.externalEditor) {
      externalEditor = data.externalEditor;
    }
    if (data.cceEnabled) {
      cceEnabled = data.cceEnabled;
    }
    syncCredentialsToPi();
  } catch {
    // If the file is missing, corrupt, or unreadable, start fresh.
  }
}

/* ───────── Session title ───────── */

export function getSessionTitle(): string {
  return sessionTitle;
}

export function setSessionTitle(title: string): void {
  sessionTitle = title;
  saveSettings();
  void emitConfigChange("sessionTitle", title);
}

/* ───────── Provider configuration ───────── */

export function configureProvider(config: ProviderConfig): void {
  providerConfigs.set(config.provider, config);
  saveSettings();
  void emitConfigChange("provider", config.provider);
  // Sync to Pi AuthStorage so agent sessions can resolve API keys
  if (config.authMethod === "apikey") {
    getPiAuthStorage().set(config.provider, {
      type: "api_key",
      key: config.credential,
    });
  } else {
    getPiAuthStorage().set(config.provider, {
      type: "api_key",
      key: config.credential,
    });
  }
}

export function removeProvider(provider: string): void {
  providerConfigs.delete(provider);
  saveSettings();
  getPiAuthStorage().remove(provider);
  void emitConfigChange("provider", provider);
}

export function isProviderConfigured(provider: string): boolean {
  return providerConfigs.has(provider);
}

export function getProviderConfig(
  provider: string
): ProviderConfig | undefined {
  return providerConfigs.get(provider);
}

export function getConfiguredProviders(): string[] {
  return Array.from(providerConfigs.keys());
}

/* ───────── Current model (koi reference) ───────── */

export function getCurrentModel(): ModelRef | null {
  return currentModel;
}

export function setCurrentModel(ref: ModelRef | null): void {
  currentModel = ref;
  saveSettings();
  void emitConfigChange("currentModel", ref);
}

export function getAuxiliaryModel(): ModelRef | null {
  return auxiliaryModel;
}

export function setAuxiliaryModel(ref: ModelRef | null): void {
  auxiliaryModel = ref;
  saveSettings();
  void emitConfigChange("auxiliaryModel", ref);
}

/* ───────── External editor configuration ───────── */

export function getExternalEditor(): string | null {
  return externalEditor;
}

export function setExternalEditor(path: string | null): void {
  externalEditor = path;
  saveSettings();
  void emitConfigChange("externalEditor", path);
}

/* ───────── Model discovery (via pi-ai, for modals) ───────── */

export function getAllProviders(): string[] {
  return getProviders();
}

export function getProviderModels(provider: string): Model<Api>[] {
  return getModels(provider as KnownProvider);
}

/* ───────── Credential validation ───────── */

export async function validateProviderCredential(
  provider: string,
  credential: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const models = getModels(provider as KnownProvider);
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
  } catch (err: unknown) {
    return { valid: false, error: getErrorMessage(err) };
  }
}

/* ───────── Auxiliary model call ───────── */

/**
 * Call the auxiliary model with a system prompt and user messages.
 * Returns the model's text response or null if the model is not configured or call fails.
 */
export async function callAuxiliaryModel(
  systemPrompt: string,
  userMessages: Array<{ role: "user"; content: string; timestamp: number }>
): Promise<string | null> {
  const ref = getAuxiliaryModel();
  if (!ref) {
    return null;
  }

  const model = resolvePiModel(ref);
  if (!model) {
    return null;
  }

  const registry = getPiModelRegistry();
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return null;
  }

  try {
    const result = await completeSimple(
      model,
      {
        systemPrompt,
        messages: userMessages,
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        maxTokens: 1024,
        maxRetries: 1,
        timeoutMs: 30000,
      }
    );

    if (result.stopReason === "error" || result.stopReason === "aborted") {
      return null;
    }

    const text = result.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");
    return text;
  } catch {
    return null;
  }
}

/* ───────── CCE (Cat's Context Engine) toggle ───────── */

export function isCceEnabled(): boolean {
  return cceEnabled;
}

export function setCceEnabled(enabled: boolean): void {
  cceEnabled = enabled;
  saveSettings();
}
