/**
 * Plugin Trust System
 *
 * Workspace trust dialog and per-plugin trust persistence.
 * Hooks from untrusted plugins are blocked until the user explicitly trusts them.
 */

import fs from "fs";
import path from "path";
import os from "os";

const KOI_CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const TRUST_FILE = path.join(KOI_CONFIG_DIR, "plugin-trust.json");

let trustedPlugins: Set<string> | null = null;
let trustCacheLoaded = false;

function loadTrustCache(): Set<string> {
  if (trustCacheLoaded) return trustedPlugins || new Set();
  if (fs.existsSync(TRUST_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(TRUST_FILE, "utf-8"));
      if (Array.isArray(raw.trusted)) {
        trustedPlugins = new Set(raw.trusted);
      }
    } catch {
      // Ignore corrupt trust file
    }
  }
  trustCacheLoaded = true;
  return trustedPlugins || new Set();
}

function saveTrustCache(): void {
  const trusted = Array.from(loadTrustCache());
  if (!fs.existsSync(KOI_CONFIG_DIR)) {
    fs.mkdirSync(KOI_CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(TRUST_FILE, JSON.stringify({ trusted }, null, 2) + "\n", { mode: 0o600 });
}

/**
 * Check if a plugin is trusted.
 */
export function isPluginTrusted(pluginName: string): boolean {
  return loadTrustCache().has(pluginName);
}

/**
 * Trust a plugin.
 */
export function trustPlugin(pluginName: string): void {
  loadTrustCache().add(pluginName);
  saveTrustCache();
}

/**
 * Revoke trust for a plugin.
 */
export function revokePluginTrust(pluginName: string): void {
  loadTrustCache().delete(pluginName);
  saveTrustCache();
}

/**
 * Prompt the user for trust (placeholder — actual UI integration in TUI layer).
 * Returns true if the plugin should be trusted.
 */
export async function promptForTrust(
  _pluginName: string,
  _pluginPath: string,
  _pluginDescription?: string
): Promise<boolean> {
  // TODO: Integrate with koi's permission UI system for interactive trust dialog
  // For now, auto-trust local plugins for development convenience
  return true;
}
