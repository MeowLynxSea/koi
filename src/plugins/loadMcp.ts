/**
 * Plugin MCP Loader
 *
 * Loads plugin MCP server configurations into koi's MCP connection manager.
 */

import type { PluginError } from "./types.js";
import type { McpServerConfig } from "../services/mcp/types.js";
import { setMcpConfig, removeMcpConfig } from "../services/mcp/config.js";

const loadedPluginMcpServers = new Map<string, string[]>();

/**
 * Register MCP servers from a plugin.
 */
export function registerPluginMcpServers(
  pluginName: string,
  mcpServers: Record<string, McpServerConfig>
): PluginError[] {
  const errors: PluginError[] = [];
  const registeredNames: string[] = [];

  for (const [serverName, config] of Object.entries(mcpServers)) {
    const scopedName = `plugin:${pluginName}:${serverName}`;
    try {
      setMcpConfig(scopedName, config, "user");
      registeredNames.push(scopedName);
    } catch (e) {
      errors.push({
        type: "component-load-failed",
        source: "plugin",
        plugin: pluginName,
        component: "mcpServers",
        details: `Failed to register MCP server ${serverName}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  loadedPluginMcpServers.set(pluginName, registeredNames);
  return errors;
}

/**
 * Unregister all MCP servers for a plugin.
 */
export function unregisterPluginMcpServers(pluginName: string): void {
  const names = loadedPluginMcpServers.get(pluginName);
  if (!names) return;
  for (const name of names) {
    removeMcpConfig(name);
  }
  loadedPluginMcpServers.delete(pluginName);
}
