/**
 * Plugin Agent Loader
 *
 * Loads plugin agent definitions and project-level .claude/agents/ definitions.
 * Agents are markdown files with YAML frontmatter that define subagent behaviors.
 */

import path from "path";
import type { LoadedPlugin, PluginError } from "./types.js";
import {
  loadAgentDefinitionsFromDir,
  registerAgentDefinitions,
  clearAgentDefinitions,
} from "../agent/agent-definitions.js";

const loadedPluginAgentNames = new Map<string, string[]>();

/**
 * Register agents from a plugin.
 */
export function registerPluginAgents(plugin: LoadedPlugin): PluginError[] {
  const errors: PluginError[] = [];
  const registeredNames: string[] = [];
  loadedPluginAgentNames.set(plugin.name, registeredNames);

  const paths = plugin.agentsPaths || (plugin.agentsPath ? [plugin.agentsPath] : []);

  for (const agentPath of paths) {
    const result = loadAgentDefinitionsFromDir(agentPath, "plugin");
    for (const agent of result.agents) {
      agent.source = "plugin";
      // Tag with plugin name
      (agent as { plugin?: string }).plugin = plugin.name;
    }
    registerAgentDefinitions(result.agents);
    registeredNames.push(...result.agents.map((a) => a.name));
    for (const err of result.errors) {
      errors.push({
        type: "component-load-failed",
        source: plugin.path,
        plugin: plugin.name,
        component: "agents",
        details: `${err.path}: ${err.error}`,
      });
    }
  }

  return errors;
}

/**
 * Load project-level agents from .claude/agents/ directory.
 */
export function loadProjectAgents(cwd: string): PluginError[] {
  const errors: PluginError[] = [];
  const agentsDir = path.join(cwd, ".claude", "agents");
  const result = loadAgentDefinitionsFromDir(agentsDir, "projectSettings");
  registerAgentDefinitions(result.agents);
  for (const err of result.errors) {
    errors.push({
      type: "component-load-failed",
      source: agentsDir,
      component: "agents",
      details: `${err.path}: ${err.error}`,
    });
  }
  return errors;
}

/**
 * Unregister all agents for a plugin.
 */
export function unregisterPluginAgents(pluginName: string): void {
  const names = loadedPluginAgentNames.get(pluginName);
  if (!names) return;
  // TODO: Remove only plugin agents without clearing all
  // For now, we clear and re-register remaining plugins' agents on refresh
  loadedPluginAgentNames.delete(pluginName);
}

/**
 * Clear all agent definitions and re-register project agents.
 */
export function refreshAgentDefinitions(cwd: string): void {
  clearAgentDefinitions();
  loadProjectAgents(cwd);
}
