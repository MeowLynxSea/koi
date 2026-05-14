/**
 * Built-in Plugin Registry
 *
 * Allows koi to ship plugins that are bundled with the CLI.
 * Built-in plugins use the identifier `{name}@builtin`.
 */

import type { BuiltinPluginDefinition, LoadedPlugin, PluginManifest } from "./types.js";

const builtinPlugins = new Map<string, BuiltinPluginDefinition>();

/**
 * Register a built-in plugin definition.
 */
export function registerBuiltinPlugin(definition: BuiltinPluginDefinition): void {
  builtinPlugins.set(definition.name, definition);
}

/**
 * Get all registered built-in plugin definitions.
 */
export function getBuiltinPluginDefinitions(): BuiltinPluginDefinition[] {
  return Array.from(builtinPlugins.values());
}

/**
 * Get a specific built-in plugin definition by name.
 */
export function getBuiltinPluginDefinition(name: string): BuiltinPluginDefinition | undefined {
  return builtinPlugins.get(name);
}

/**
 * Convert a built-in plugin definition to a LoadedPlugin.
 */
export function loadBuiltinPlugin(name: string): LoadedPlugin | null {
  const def = builtinPlugins.get(name);
  if (!def) return null;
  if (def.isAvailable && !def.isAvailable()) return null;

  const manifest: PluginManifest = {
    name: def.name,
    version: def.version,
    description: def.description,
  };

  return {
    name: def.name,
    manifest,
    path: "builtin",
    source: "builtin",
    repository: "builtin",
    isBuiltin: true,
    hooksConfig: def.hooks,
    mcpServers: def.mcpServers,
  };
}

/**
 * Load all available built-in plugins.
 */
export function loadAllBuiltinPlugins(): LoadedPlugin[] {
  const result: LoadedPlugin[] = [];
  for (const [name, def] of builtinPlugins) {
    if (def.isAvailable && !def.isAvailable()) continue;
    const loaded = loadBuiltinPlugin(name);
    if (loaded) result.push(loaded);
  }
  return result;
}
