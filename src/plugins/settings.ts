/**
 * Plugin Settings Bridge
 *
 * Reads and writes plugin-related settings from koi's settings.json.
 * Also reads Claude Code's settings.json for compatibility.
 *
 * Supports three scopes (matching Claude Code):
 * - userSettings:   ~/.claude/settings.json
 * - projectSettings: <cwd>/.claude/settings.json
 * - localSettings:   <cwd>/.claude/settings.local.json
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
let cachedCwd: string | null = null;

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function getProjectSettingsPath(cwd: string): string {
  return path.join(cwd, ".claude", "settings.json");
}

function getLocalSettingsPath(cwd: string): string {
  return path.join(cwd, ".claude", "settings.local.json");
}

/**
 * Read the plugins section from settings.
 * Merges multiple sources in priority order (highest first):
 *   1. koi user settings (~/.config/koi/settings.json)
 *   2. Claude Code user settings (~/.claude/settings.json)
 *   3. Claude Code project settings (./.claude/settings.json)
 *   4. Claude Code local settings (./.claude/settings.local.json)
 */
export function getPluginSettings(cwd?: string): PluginSettingsSection {
  if (cachedSettings && cachedCwd === (cwd || process.cwd())) return cachedSettings;

  const resolvedCwd = cwd || process.cwd();

  const koiRaw = readJsonFile(KOI_SETTINGS_PATH) as Record<string, unknown> | null;
  const claudeRaw = readJsonFile(CLAUDE_SETTINGS_PATH) as Record<string, unknown> | null;
  const projectRaw = readJsonFile(getProjectSettingsPath(resolvedCwd)) as Record<string, unknown> | null;
  const localRaw = readJsonFile(getLocalSettingsPath(resolvedCwd)) as Record<string, unknown> | null;

  const koiPlugins = (koiRaw?.["plugins"] as PluginSettingsSection | undefined) || {};
  const claudePlugins = (claudeRaw?.["plugins"] as PluginSettingsSection | undefined) || {};
  const projectPlugins = (projectRaw?.["plugins"] as PluginSettingsSection | undefined) || {};
  const localPlugins = (localRaw?.["plugins"] as PluginSettingsSection | undefined) || {};

  // Merge: koi > claude user > project > local
  const merged: PluginSettingsSection = {
    enabledPlugins: localPlugins.enabledPlugins
      ?? projectPlugins.enabledPlugins
      ?? koiPlugins.enabledPlugins
      ?? claudePlugins.enabledPlugins
      ?? [],
    pluginSettings: {
      ...(claudePlugins.pluginSettings || {}),
      ...(projectPlugins.pluginSettings || {}),
      ...(localPlugins.pluginSettings || {}),
      ...(koiPlugins.pluginSettings || {}),
    },
    hooks: mergeHooksSettings(
      claudePlugins.hooks,
      projectPlugins.hooks,
      localPlugins.hooks,
      koiPlugins.hooks
    ),
    allowedHttpHookUrls: koiPlugins.allowedHttpHookUrls
      ?? claudePlugins.allowedHttpHookUrls
      ?? projectPlugins.allowedHttpHookUrls
      ?? localPlugins.allowedHttpHookUrls,
    allowedEnvVars: koiPlugins.allowedEnvVars
      ?? claudePlugins.allowedEnvVars
      ?? projectPlugins.allowedEnvVars
      ?? localPlugins.allowedEnvVars,
  };

  // Also read top-level "hooks" key from project/local settings (Claude Code format)
  const projectHooks = (projectRaw?.["hooks"] as HooksSettings | undefined);
  const localHooks = (localRaw?.["hooks"] as HooksSettings | undefined);
  if (projectHooks || localHooks) {
    merged.hooks = mergeHooksSettings(merged.hooks, projectHooks, localHooks, undefined);
  }

  cachedSettings = merged;
  cachedCwd = resolvedCwd;
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
export function isPluginEnabled(pluginName: string, cwd?: string): boolean {
  const settings = getPluginSettings(cwd);
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
 * Merges all scope levels.
 */
export function getSettingsHooks(cwd?: string): HooksSettings {
  return getPluginSettings(cwd).hooks || {};
}

/**
 * Clear the in-memory cache (call after external settings changes or cwd changes).
 */
export function invalidatePluginSettingsCache(): void {
  cachedSettings = null;
  cachedCwd = null;
}

// ============================================================================
// Helpers
// ============================================================================

function mergeHooksSettings(
  a: HooksSettings | undefined,
  b: HooksSettings | undefined,
  c: HooksSettings | undefined,
  d: HooksSettings | undefined
): HooksSettings | undefined {
  const sources = [a, b, c, d].filter(Boolean) as HooksSettings[];
  if (sources.length === 0) return undefined;

  const merged: HooksSettings = {};
  for (const source of sources) {
    for (const [event, matchers] of Object.entries(source)) {
      merged[event as keyof HooksSettings] = [
        ...(merged[event as keyof HooksSettings] || []),
        ...(matchers || []),
      ];
    }
  }
  return merged;
}
