/**
 * Plugin Loader
 *
 * Discovers, validates, and loads plugins from local directories.
 * Supports both koi-native and Claude Code plugin directories.
 */

import fs from "fs";
import path from "path";
import { PluginManifestSchema, HooksSettingsSchema } from "./schemas.js";
import type {
  PluginManifest,
  LoadedPlugin,
  HooksSettings,
  PluginError,
} from "./types.js";
import { PLUGIN_DIRS, PLUGIN_CONVENTIONAL_PATHS } from "./paths.js";
import type { McpServerConfig } from "../services/mcp/types.js";

// ============================================================================
// Discovery
// ============================================================================

/**
 * Find all plugin directories in the given search paths.
 * Each immediate subdirectory that contains a plugin.json is considered a plugin.
 */
export function discoverPlugins(searchDirs: string[] = PLUGIN_DIRS): string[] {
  const pluginRoots: string[] = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const pluginPath = path.join(dir, entry.name);
        const manifestPath = path.join(pluginPath, PLUGIN_CONVENTIONAL_PATHS.manifest);
        if (fs.existsSync(manifestPath)) {
          pluginRoots.push(pluginPath);
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }
  return pluginRoots;
}

/**
 * Load a single plugin from its root directory.
 */
export function loadPlugin(pluginPath: string): {
  plugin?: LoadedPlugin;
  errors: PluginError[];
} {
  const errors: PluginError[] = [];
  const manifestPath = path.join(pluginPath, PLUGIN_CONVENTIONAL_PATHS.manifest);

  if (!fs.existsSync(manifestPath)) {
    errors.push({
      type: "manifest-parse-error",
      source: pluginPath,
      manifestPath,
      parseError: "plugin.json not found",
    });
    return { errors };
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    errors.push({
      type: "manifest-parse-error",
      source: pluginPath,
      manifestPath,
      parseError: e instanceof Error ? e.message : String(e),
    });
    return { errors };
  }

  const parseResult = PluginManifestSchema.safeParse(rawManifest);
  if (!parseResult.success) {
    errors.push({
      type: "manifest-validation-error",
      source: pluginPath,
      manifestPath,
      validationErrors: (parseResult.error as unknown as { errors: Array<{ path: (string | number)[]; message: string }> }).errors.map(
        (e: { path: (string | number)[]; message: string }) => `${e.path.join(".")}: ${e.message}`
      ),
    });
    return { errors };
  }

  const manifest = parseResult.data as PluginManifest;
  const pluginName = manifest.name;

  // Resolve component paths
  const commandsPaths = resolveComponentPaths(pluginPath, manifest.commands, "commands");
  const agentsPaths = resolveComponentPaths(pluginPath, manifest.agents, "agents");
  const skillsPaths = resolveComponentPaths(pluginPath, manifest.skills, "skills");
  const outputStylesPaths = resolveComponentPaths(pluginPath, manifest.outputStyles, "outputStyles");

  // Resolve hooks
  const hooksConfig = resolveHooksConfig(pluginPath, manifest.hooks);

  // Resolve MCP servers
  const mcpServers = resolveMcpServers(pluginPath, manifest.mcpServers);

  const plugin: LoadedPlugin = {
    name: pluginName,
    manifest,
    path: pluginPath,
    source: "local",
    repository: manifest.repository || pluginPath,
    commandsPath: commandsPaths[0],
    commandsPaths: commandsPaths.length > 0 ? commandsPaths : undefined,
    commandsMetadata: typeof manifest.commands === "object" && !Array.isArray(manifest.commands)
      ? manifest.commands
      : undefined,
    agentsPath: agentsPaths[0],
    agentsPaths: agentsPaths.length > 0 ? agentsPaths : undefined,
    skillsPath: skillsPaths[0],
    skillsPaths: skillsPaths.length > 0 ? skillsPaths : undefined,
    outputStylesPath: outputStylesPaths[0],
    outputStylesPaths: outputStylesPaths.length > 0 ? outputStylesPaths : undefined,
    hooksConfig: hooksConfig || undefined,
    mcpServers: mcpServers || undefined,
    settings: manifest.settings,
  };

  return { plugin, errors };
}

/**
 * Load all discoverable plugins.
 */
export function loadAllPlugins(): {
  plugins: LoadedPlugin[];
  errors: PluginError[];
} {
  const plugins: LoadedPlugin[] = [];
  const errors: PluginError[] = [];
  const seenNames = new Set<string>();

  const roots = discoverPlugins();
  for (const root of roots) {
    const result = loadPlugin(root);
    if (result.plugin) {
      if (seenNames.has(result.plugin.name)) {
        // Skip duplicate; koi dir takes precedence since it's searched first
        continue;
      }
      seenNames.add(result.plugin.name);
      plugins.push(result.plugin);
    }
    errors.push(...result.errors);
  }

  return { plugins, errors };
}

// ============================================================================
// Path Resolution Helpers
// ============================================================================

function resolveComponentPaths(
  pluginPath: string,
  config: string | string[] | Record<string, unknown> | undefined,
  _conventionalName: string
): string[] {
  if (!config) {
    // Try conventional path
    const conventional = path.join(pluginPath, PLUGIN_CONVENTIONAL_PATHS[_conventionalName as keyof typeof PLUGIN_CONVENTIONAL_PATHS]);
    if (fs.existsSync(conventional)) {
      return [conventional];
    }
    return [];
  }

  if (typeof config === "string") {
    const resolved = path.resolve(pluginPath, config);
    return fs.existsSync(resolved) ? [resolved] : [];
  }

  if (Array.isArray(config)) {
    return config
      .map((p) => path.resolve(pluginPath, p))
      .filter((p) => fs.existsSync(p));
  }

  // Object mapping: resolve all source paths
  const values = Object.values(config as Record<string, unknown>);
  const results: string[] = [];
  for (const v of values) {
    if (typeof v === "object" && v !== null) {
      const obj = v as { source?: string };
      if (obj.source) {
        const resolved = path.resolve(pluginPath, obj.source);
        if (fs.existsSync(resolved)) results.push(resolved);
      }
    }
  }
  return results;
}

function resolveHooksConfig(
  pluginPath: string,
  config: string | HooksSettings | (string | HooksSettings)[] | undefined
): HooksSettings | null {
  if (!config) {
    // Try conventional path
    const conventional = path.join(pluginPath, PLUGIN_CONVENTIONAL_PATHS.hooks, PLUGIN_CONVENTIONAL_PATHS.hooksConfig);
    if (fs.existsSync(conventional)) {
      try {
        const raw = JSON.parse(fs.readFileSync(conventional, "utf-8"));
        const parsed = HooksSettingsSchema.safeParse(raw);
        if (parsed.success) return parsed.data as HooksSettings;
      } catch {
        // Ignore invalid hooks.json
      }
    }
    return null;
  }

  const items = Array.isArray(config) ? config : [config];
  const merged: HooksSettings = {};

  for (const item of items) {
    if (typeof item === "string") {
      const filePath = path.resolve(pluginPath, item);
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const parsed = HooksSettingsSchema.safeParse(raw);
        if (parsed.success) {
          for (const [event, matchers] of Object.entries(parsed.data)) {
            merged[event as keyof HooksSettings] = [
              ...(merged[event as keyof HooksSettings] || []),
              ...(matchers || []),
            ];
          }
        }
      } catch {
        // Ignore invalid hooks file
      }
    } else {
      for (const [event, matchers] of Object.entries(item)) {
        merged[event as keyof HooksSettings] = [
          ...(merged[event as keyof HooksSettings] || []),
          ...(matchers || []),
        ];
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function resolveMcpServers(
  pluginPath: string,
  config: string | Record<string, McpServerConfig> | (string | Record<string, McpServerConfig>)[] | undefined
): Record<string, McpServerConfig> | null {
  if (!config) {
    // Try conventional .mcp.json
    const conventional = path.join(pluginPath, PLUGIN_CONVENTIONAL_PATHS.mcpConfig);
    if (fs.existsSync(conventional)) {
      try {
        const raw = JSON.parse(fs.readFileSync(conventional, "utf-8"));
        if (raw.mcpServers) return raw.mcpServers as Record<string, McpServerConfig>;
      } catch {
        // Ignore invalid .mcp.json
      }
    }
    return null;
  }

  const items = Array.isArray(config) ? config : [config];
  const merged: Record<string, McpServerConfig> = {};

  for (const item of items) {
    if (typeof item === "string") {
      const filePath = path.resolve(pluginPath, item);
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (raw.mcpServers) Object.assign(merged, raw.mcpServers);
      } catch {
        // Ignore invalid MCP file
      }
    } else {
      Object.assign(merged, item);
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}


