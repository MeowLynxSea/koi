/**
 * Plugin Agent Loader
 *
 * Loads plugin agent definitions. Agents are markdown files with frontmatter
 * that define subagent behaviors.
 *
 * For now, this is a stub — full agent loading will integrate with the
 * existing agent tool when subagent customization is needed.
 */

import type { LoadedPlugin, PluginError } from "./types.js";

const loadedPluginAgents = new Map<string, Set<string>>();

/**
 * Register agents from a plugin.
 */
export function registerPluginAgents(plugin: LoadedPlugin): PluginError[] {
  const errors: PluginError[] = [];
  const registeredNames = new Set<string>();
  loadedPluginAgents.set(plugin.name, registeredNames);

  const paths = plugin.agentsPaths || (plugin.agentsPath ? [plugin.agentsPath] : []);

  for (const agentPath of paths) {
    // TODO: Load agent markdown files and register as subagent variations
    // This requires extending the agent tool to support custom agent definitions
    void agentPath;
  }

  return errors;
}

/**
 * Unregister all agents for a plugin.
 */
export function unregisterPluginAgents(pluginName: string): void {
  loadedPluginAgents.delete(pluginName);
}
