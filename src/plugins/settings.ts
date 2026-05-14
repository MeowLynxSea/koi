/**
 * Plugin Settings Bridge
 *
 * Reads and writes plugin-related settings from koi's settings.json.
 * Also reads Claude Code's settings.json for compatibility.
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { HooksSettings, PluginSettingsSection } from "./types.js";

const KOI_CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const KOI_SETTINGS_PATH = path.join(KOI_CONFIG_DIR, "settings.json");
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

// In-memory cache
let cachedSettings: PluginSettingsSection | null = null;

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Read the plugins section from settings.
 * Merges Claude Code settings with koi settings (koi takes precedence).
 */
export function getPluginSettings(): PluginSettingsSection {
  if (cachedSettings) return cachedSettings;

  const koiRaw = readJsonFile(KOI_SETTINGS_PATH) as Record<string, unknown> | null;
  const claudeRaw = readJsonFile(CLAUDE_SETTINGS_PATH) as Record<string, unknown> | null;

  const koiPlugins = (koiRaw?.["plugins"] as PluginSettingsSection | undefined) || {};
  const claudePlugins = (claudeRaw?.["plugins"] as PluginSettingsSection | undefined) || {};

  // Merge: koi takes precedence over claude
  const merged: PluginSettingsSection = {
    enabledPlugins: koiPlugins.enabledPlugins ?? claudePlugins.enabledPlugins ?? [],
    pluginSettings: {
      ...(claudePlugins.pluginSettings || {}),
      ...(koiPlugins.pluginSettings || {}),
    },
    hooks: mergeHooksSettings(claudePlugins.hooks, koiPlugins.hooks),
    allowedHttpHookUrls: koiPlugins.allowedHttpHookUrls ?? claudePlugins.allowedHttpHookUrls,
    allowedEnvVars: koiPlugins.allowedEnvVars ?? claudePlugins.allowedEnvVars,
  };

  cachedSettings = merged;
  return merged;
}

/**
 * Write the plugins section to koi's settings.json.
 */
export function setPluginSettings(section: PluginSettingsSection): void {
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(KOI_SETTINGS_PATH)) {
    try {
      raw = JSON.parse(fs.readFileSync(KOI_SETTINGS_PATH, "utf-8"));
    } catch {
      // Ignore corrupt file
    }
  }

  raw["plugins"] = section;

  if (!fs.existsSync(KOI_CONFIG_DIR)) {
    fs.mkdirSync(KOI_CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(KOI_SETTINGS_PATH, JSON.stringify(raw, null, 2) + "\n", { mode: 0o600 });
  cachedSettings = section;
}

/**
 * Check if a plugin is enabled.
 */
export function isPluginEnabled(pluginName: string): boolean {
  const settings = getPluginSettings();
  return settings.enabledPlugins?.includes(pluginName) ?? false;
}

/**
 * Enable a plugin.
 */
export function enablePlugin(pluginName: string): void {
  const settings = getPluginSettings();
  if (!settings.enabledPlugins) settings.enabledPlugins = [];
  if (!settings.enabledPlugins.includes(pluginName)) {
    settings.enabledPlugins.push(pluginName);
    setPluginSettings(settings);
  }
}

/**
 * Disable a plugin.
 */
export function disablePlugin(pluginName: string): void {
  const settings = getPluginSettings();
  if (settings.enabledPlugins) {
    settings.enabledPlugins = settings.enabledPlugins.filter((n) => n !== pluginName);
    setPluginSettings(settings);
  }
}

/**
 * Get plugin-specific settings.
 */
export function getPluginSetting(pluginName: string, key: string): unknown {
  const settings = getPluginSettings();
  return settings.pluginSettings?.[pluginName]?.[key];
}

/**
 * Set plugin-specific settings.
 */
export function setPluginSetting(pluginName: string, key: string, value: unknown): void {
  const settings = getPluginSettings();
  if (!settings.pluginSettings) settings.pluginSettings = {};
  if (!settings.pluginSettings[pluginName]) settings.pluginSettings[pluginName] = {};
  settings.pluginSettings[pluginName][key] = value;
  setPluginSettings(settings);
}

/**
 * Get hooks defined in settings (user-defined hooks).
 */
export function getSettingsHooks(): HooksSettings {
  return getPluginSettings().hooks || {};
}

/**
 * Clear the in-memory cache (call after external settings changes).
 */
export function invalidatePluginSettingsCache(): void {
  cachedSettings = null;
}

// ============================================================================
// Helpers
// ============================================================================

function mergeHooksSettings(
  a: HooksSettings | undefined,
  b: HooksSettings | undefined
): HooksSettings | undefined {
  if (!a && !b) return undefined;
  const merged: HooksSettings = { ...(a || {}) };
  for (const [event, matchers] of Object.entries(b || {})) {
    merged[event as keyof HooksSettings] = [
      ...(merged[event as keyof HooksSettings] || []),
      ...(matchers || []),
    ];
  }
  return merged;
}
