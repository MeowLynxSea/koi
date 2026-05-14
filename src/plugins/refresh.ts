/**
 * Plugin Refresh
 *
 * Reconciles the list of enabled plugins with their loaded components.
 * Responsible for hot-loading and unloading plugin commands, agents, hooks, and MCP servers.
 */

import type { LoadedPlugin, PluginError } from "./types.js";
import { loadAllPlugins } from "./loader.js";
import { loadAllBuiltinPlugins } from "./builtin.js";
import { isPluginEnabled } from "./settings.js";
import { registerPluginHooks, unregisterPluginHooks } from "./loadHooks.js";
import { registerPluginCommands } from "./loadCommands.js";
import { registerPluginAgents, unregisterPluginAgents } from "./loadAgents.js";
import { registerPluginMcpServers } from "./loadMcp.js";

interface ActivePluginState {
  plugins: LoadedPlugin[];
  errors: PluginError[];
}

let activeState: ActivePluginState = { plugins: [], errors: [] };

/**
 * Get the current active plugin state.
 */
export function getActivePlugins(): LoadedPlugin[] {
  return activeState.plugins;
}

/**
 * Refresh active plugins by reloading all enabled plugins and their components.
 */
export function refreshActivePlugins(): {
  plugins: LoadedPlugin[];
  errors: PluginError[];
} {
  const errors: PluginError[] = [];

  // Unload current plugin components
  for (const plugin of activeState.plugins) {
    try {
      unregisterPluginHooks(plugin.name);
      unregisterPluginAgents(plugin.name);
    } catch {
      // Ignore unload errors
    }
  }

  // Load all plugins from disk + built-ins
  const { plugins: diskPlugins, errors: loadErrors } = loadAllPlugins();
  const builtinPlugins = loadAllBuiltinPlugins();
  errors.push(...loadErrors);

  const allPlugins = [...builtinPlugins, ...diskPlugins];
  const enabledPlugins: LoadedPlugin[] = [];

  for (const plugin of allPlugins) {
    const enabled = plugin.isBuiltin
      ? isPluginEnabled(`${plugin.name}@builtin`) ||
        (plugin.manifest.name && isPluginEnabled(plugin.manifest.name))
      : isPluginEnabled(plugin.name);

    if (!enabled) continue;

    // Load components
    if (plugin.hooksConfig) {
      const hookErrors = registerPluginHooks(plugin.name, plugin.path, plugin.hooksConfig);
      errors.push(...hookErrors);
    }

    if (plugin.commandsPath || plugin.commandsPaths) {
      const cmdErrors = registerPluginCommands(plugin);
      errors.push(...cmdErrors);
    }

    if (plugin.mcpServers) {
      const mcpErrors = registerPluginMcpServers(plugin.name, plugin.mcpServers);
      errors.push(...mcpErrors);
    }

    if (plugin.agentsPath || plugin.agentsPaths) {
      const agentErrors = registerPluginAgents(plugin);
      errors.push(...agentErrors);
    }

    enabledPlugins.push(plugin);
  }

  activeState = { plugins: enabledPlugins, errors };
  return activeState;
}

/**
 * Load all plugins without enabling them (for discovery/inspection).
 */
export function loadAllPluginsForDiscovery(): {
  plugins: LoadedPlugin[];
  errors: PluginError[];
} {
  const { plugins: diskPlugins, errors } = loadAllPlugins();
  const builtinPlugins = loadAllBuiltinPlugins();
  return { plugins: [...builtinPlugins, ...diskPlugins], errors };
}
