/**
 * Plugin Command Loader
 *
 * Loads plugin commands and skills into koi's skill registry.
 * Namespaces all plugin skills as `plugin:pluginName:commandName`.
 */

import fs from "fs";
import path from "path";
import type { LoadedPlugin, PluginError, CommandMetadata } from "./types.js";
import { registerSkill, unregisterSkill } from "../skills/loader.js";
import type { SkillCommand, ContentBlockParam } from "../skills/types.js";

const loadedPluginSkills = new Map<string, Set<string>>();

/**
 * Register all commands/skills from a plugin.
 */
export function registerPluginCommands(plugin: LoadedPlugin): PluginError[] {
  const errors: PluginError[] = [];
  const registeredNames = new Set<string>();
  loadedPluginSkills.set(plugin.name, registeredNames);

  const paths = plugin.commandsPaths || (plugin.commandsPath ? [plugin.commandsPath] : []);

  for (const cmdPath of paths) {
    if (!fs.existsSync(cmdPath)) {
      errors.push({
        type: "path-not-found",
        source: plugin.path,
        plugin: plugin.name,
        path: cmdPath,
        component: "commands",
      });
      continue;
    }

    try {
      const stat = fs.statSync(cmdPath);
      if (stat.isDirectory()) {
        loadCommandsFromDir(cmdPath, plugin, registeredNames, errors);
      } else if (stat.isFile() && cmdPath.endsWith(".md")) {
        loadCommandFromFile(cmdPath, plugin, undefined, registeredNames, errors);
      }
    } catch (e) {
      errors.push({
        type: "component-load-failed",
        source: plugin.path,
        plugin: plugin.name,
        component: "commands",
        details: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Also load object-mapping commands from metadata
  if (plugin.commandsMetadata) {
    for (const [cmdName, meta] of Object.entries(plugin.commandsMetadata)) {
      if (meta.source) {
        loadCommandFromFile(
          path.resolve(plugin.path, meta.source),
          plugin,
          { ...meta, name: cmdName },
          registeredNames,
          errors
        );
      } else if (meta.content) {
        const skillName = `plugin:${plugin.name}:${cmdName}`;
        const skill = createPluginSkillCommand(skillName, meta.description || `${plugin.name} command`, meta.content, plugin.path);
        registerSkill(skill);
        registeredNames.add(skillName);
      }
    }
  }

  return errors;
}

/**
 * Unregister all commands for a plugin.
 */
export function unregisterPluginCommands(pluginName: string): void {
  const names = loadedPluginSkills.get(pluginName);
  if (!names) return;
  for (const name of names) {
    unregisterSkill(name);
  }
  loadedPluginSkills.delete(pluginName);
}

// ============================================================================
// Helpers
// ============================================================================

function loadCommandsFromDir(
  dir: string,
  plugin: LoadedPlugin,
  registeredNames: Set<string>,
  errors: PluginError[]
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Check for SKILL.md
      const skillMd = path.join(fullPath, "SKILL.md");
      if (fs.existsSync(skillMd)) {
        loadCommandFromFile(skillMd, plugin, undefined, registeredNames, errors);
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      loadCommandFromFile(fullPath, plugin, undefined, registeredNames, errors);
    }
  }
}

function loadCommandFromFile(
  filePath: string,
  plugin: LoadedPlugin,
  overrideMeta: (CommandMetadata & { name?: string }) | undefined,
  registeredNames: Set<string>,
  errors: PluginError[]
): void {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const baseName = overrideMeta?.name || path.basename(filePath, ".md");
    const skillName = `plugin:${plugin.name}:${baseName}`;

    // Simple frontmatter parsing for description
    const description = extractDescription(content) || overrideMeta?.description || `${plugin.name} command`;

    const skill = createPluginSkillCommand(skillName, description, content, plugin.path);
    registerSkill(skill);
    registeredNames.add(skillName);
  } catch (e) {
    errors.push({
      type: "component-load-failed",
      source: plugin.path,
      plugin: plugin.name,
      component: "commands",
      details: `Failed to load ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

function createPluginSkillCommand(
  skillName: string,
  description: string,
  content: string,
  pluginPath: string
): SkillCommand {
  return {
    type: "prompt",
    name: skillName,
    description,
    hasUserSpecifiedDescription: false,
    allowedTools: [],
    disableModelInvocation: false,
    userInvocable: true,
    contentLength: content.length,
    isHidden: false,
    progressMessage: "running",
    source: "plugin",
    loadedFrom: "plugin",
    skillRoot: pluginPath,
    async getPromptForCommand(_args: string, _ctx: { tools: Record<string, (...args: unknown[]) => unknown>; env: Record<string, unknown>; cwd: string }): Promise<ContentBlockParam[]> {
      return [{ type: "text", text: content }];
    },
  };
}

function extractDescription(content: string): string | null {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
    if (trimmed.startsWith("description:")) {
      return trimmed.slice("description:".length).trim();
    }
  }
  return null;
}
