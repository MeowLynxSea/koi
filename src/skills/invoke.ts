/**
 * Skill Invocation
 *
 * Handles skill detection and execution from user input.
 * Supports Claude Code's slash command format: /skill-name <args>
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { SkillCommand, ToolUseContext, ContentBlockParam } from "./types.js";
import {
  getSkillByName,
  hasSkill,
  getActiveSkills,
  getAllSkills,
} from "./loader.js";

/**
 * Parse skill name and arguments from input
 * Supports:
 * - /skill-name args
 * - /"skill name" args
 * - /skill-name (no args)
 */
export function parseSkillInvocation(text: string): { name: string; args: string } | null {
  const trimmed = text.trim();
  
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // Handle quoted skill names: /"skill name" or /'skill name'
  if (trimmed.startsWith('/"')) {
    const endQuote = trimmed.indexOf('"', 2);
    if (endQuote === -1) return null;
    const name = trimmed.slice(2, endQuote);
    const rest = trimmed.slice(endQuote + 1).trim();
    return { name, args: rest };
  }

  if (trimmed.startsWith("/'")) {
    const endQuote = trimmed.indexOf("'", 2);
    if (endQuote === -1) return null;
    const name = trimmed.slice(2, endQuote);
    const rest = trimmed.slice(endQuote + 1).trim();
    return { name, args: rest };
  }

  // Standard slash command: /name args
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { name: trimmed.slice(1), args: "" };
  }

  const name = trimmed.slice(1, spaceIdx);
  const args = trimmed.slice(spaceIdx + 1).trim();
  
  return { name, args };
}

/**
 * Detect if input is a skill invocation
 */
export function isSkillInvocation(text: string): boolean {
  const parsed = parseSkillInvocation(text);
  if (!parsed) return false;
  return hasSkill(parsed.name);
}

/**
 * Detect skill invocation and return the skill with args
 */
export function detectSkillInvocation(
  text: string
): { skill: SkillCommand; args: string } | null {
  const parsed = parseSkillInvocation(text);
  if (!parsed) return null;

  // Try exact match first
  let skill = getSkillByName(parsed.name);
  
  // If not found, try case-insensitive match
  if (!skill) {
    skill = getSkillByName(parsed.name.toLowerCase());
  }

  // Try matching with aliases (for bundled skills)
  if (!skill) {
    const allSkills = getAllSkills();
    const nameLower = parsed.name.toLowerCase();
    
    for (const s of allSkills) {
      if (s.name.toLowerCase() === nameLower) {
        skill = s;
        break;
      }
      // Check aliases if available
      const aliases = (s as { aliases?: string[] }).aliases;
      if (aliases?.some((a) => a.toLowerCase() === nameLower)) {
        skill = s;
        break;
      }
    }
  }

  if (!skill) return null;

  return { skill, args: parsed.args };
}

/**
 * Create a tool use context for skill execution
 */
export function createToolUseContext(_session: AgentSession | null): ToolUseContext {
  return {
    tools: {},
    env: process.env as Record<string, unknown>,
    cwd: process.cwd(),
  };
}

/**
 * Invoke a skill and get the generated prompt content
 */
export async function invokeSkill(
  skill: SkillCommand,
  args: string,
  session: AgentSession | null
): Promise<ContentBlockParam[]> {
  const ctx = createToolUseContext(session);
  return skill.getPromptForCommand(args, ctx);
}

/**
 * Check if a skill is available for invocation
 */
export function isSkillAvailable(name: string): boolean {
  return hasSkill(name);
}

/**
 * Get all invokable skills (user invocable ones)
 */
export function getInvokableSkills(): SkillCommand[] {
  return getActiveSkills().filter((skill) => skill.userInvocable);
}

/**
 * Format skill for display
 */
export function formatSkillForDisplay(skill: SkillCommand): {
  name: string;
  description: string;
  usage: string;
} {
  const usage = skill.argumentHint
    ? `/${skill.name} ${skill.argumentHint}`
    : `/${skill.name}`;

  return {
    name: skill.name,
    description: skill.description,
    usage,
  };
}

/**
 * Check if input might be a skill and return suggested skill names
 */
export function getSkillSuggestions(input: string, limit = 5): string[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return [];
  
  const query = trimmed.slice(1).toLowerCase();
  if (!query) return [];

  const allSkills = getActiveSkills();
  const suggestions: Array<{ skill: SkillCommand; score: number }> = [];

  for (const skill of allSkills) {
    if (!skill.userInvocable) continue;
    
    const nameLower = skill.name.toLowerCase();
    let score = 0;

    // Exact match
    if (nameLower === query) {
      score = 100;
    }
    // Starts with
    else if (nameLower.startsWith(query)) {
      score = 50;
    }
    // Contains
    else if (nameLower.includes(query)) {
      score = 25;
    }

    if (score > 0) {
      suggestions.push({ skill, score });
    }
  }

  // Sort by score descending, then alphabetically
  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.skill.name.localeCompare(b.skill.name);
  });

  return suggestions.slice(0, limit).map((s) => s.skill.name);
}

/**
 * Get skill count by source
 */
export function getSkillCountBySource(): Record<string, number> {
  const bySource = new Map<string, number>();
  
  for (const skill of getActiveSkills()) {
    const count = bySource.get(skill.source) ?? 0;
    bySource.set(skill.source, count + 1);
  }

  return Object.fromEntries(bySource);
}

/**
 * Check if there are any skills available
 */
export function hasAnySkills(): boolean {
  return getActiveSkills().length > 0;
}
