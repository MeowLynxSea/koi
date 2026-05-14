/**
 * Plugin Path Constants
 *
 * Defines directory paths for plugin discovery, caching, and data storage.
 * Supports both koi-native and Claude Code-compatible locations.
 */

import path from "path";
import os from "os";

export const KOI_CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
export const KOI_PLUGINS_DIR = path.join(KOI_CONFIG_DIR, "plugins");
export const KOI_PLUGIN_DATA_DIR = path.join(KOI_CONFIG_DIR, "plugin-data");
export const KOI_PLUGIN_CACHE_DIR = path.join(KOI_CONFIG_DIR, "plugin-cache");

export const CLAUDE_CONFIG_DIR = path.join(os.homedir(), ".claude");
export const CLAUDE_PLUGINS_DIR = path.join(CLAUDE_CONFIG_DIR, "plugins");

/**
 * All plugin directories to search, in priority order.
 * Koi-native directory takes precedence over Claude Code directory.
 */
export const PLUGIN_DIRS = [KOI_PLUGINS_DIR, CLAUDE_PLUGINS_DIR];

/**
 * Conventional subdirectories within a plugin.
 */
export const PLUGIN_CONVENTIONAL_PATHS = {
  commands: "commands",
  agents: "agents",
  skills: "skills",
  hooks: "hooks",
  outputStyles: "output-styles",
  mcpConfig: ".mcp.json",
  lspConfig: ".lsp.json",
  manifest: "plugin.json",
  hooksConfig: "hooks.json",
} as const;
