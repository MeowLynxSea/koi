/**
 * Agent Definitions Registry
 *
 * Loads and stores custom agent definitions from .claude/agents/*.md
 * Compatible with Claude Code's agent format.
 */

import fs from "fs";
import path from "path";
import { parseFrontmatter } from "../skills/frontmatter.js";

export interface AgentDefinition {
  name: string;
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  effort?: string;
  maxTurns?: number;
  hooks?: unknown;
  skills?: string[];
  initialPrompt?: string;
  systemPrompt: string;
  source: "built-in" | "userSettings" | "projectSettings" | "plugin";
  filename?: string;
  baseDir?: string;
}

const agentRegistry = new Map<string, AgentDefinition>();

/**
 * Load all agent definitions from the given directory.
 */
export function loadAgentDefinitionsFromDir(
  dir: string,
  source: AgentDefinition["source"]
): { agents: AgentDefinition[]; errors: Array<{ path: string; error: string }> } {
  const agents: AgentDefinition[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  if (!fs.existsSync(dir)) {
    return { agents, errors };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const filePath = path.join(dir, entry.name);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(content);

      const name = frontmatter["name"] as string | undefined;
      if (!name) {
        // Not an agent definition — skip silently (could be a readme)
        continue;
      }

      const description = frontmatter["description"] as string | undefined;
      if (!description) {
        errors.push({ path: filePath, error: "Missing 'description' in frontmatter" });
        continue;
      }

      const tools = parseStringArray(frontmatter["tools"]);
      const disallowedTools = parseStringArray(frontmatter["disallowedTools"]);
      const model = frontmatter["model"] as string | undefined;
      const effort = frontmatter["effort"] as string | undefined;
      const maxTurns = parsePositiveInt(frontmatter["maxTurns"]);
      const skills = parseStringArray(frontmatter["skills"]);
      const initialPrompt = frontmatter["initialPrompt"] as string | undefined;

      agents.push({
        name,
        description: Array.isArray(description) ? description.join("\n") : description,
        tools,
        disallowedTools,
        model,
        effort,
        maxTurns,
        skills,
        initialPrompt,
        systemPrompt: body.trim(),
        source,
        filename: path.basename(filePath, ".md"),
        baseDir: dir,
      });
    } catch (e) {
      errors.push({
        path: filePath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { agents, errors };
}

/**
 * Register agent definitions in the global registry.
 */
export function registerAgentDefinitions(agents: AgentDefinition[]): void {
  for (const agent of agents) {
    agentRegistry.set(agent.name, agent);
  }
}

/**
 * Get a registered agent definition by name.
 */
export function getAgentDefinition(name: string): AgentDefinition | undefined {
  return agentRegistry.get(name);
}

/**
 * Get all registered agent definitions.
 */
export function getAllAgentDefinitions(): AgentDefinition[] {
  return Array.from(agentRegistry.values());
}

/**
 * Clear all registered agent definitions.
 */
export function clearAgentDefinitions(): void {
  agentRegistry.clear();
}

// ============================================================================
// Helpers
// ============================================================================

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}
