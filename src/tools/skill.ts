/**
 * Skill Tool — Load and invoke Koi skills
 *
 * Provides the agent with a dedicated tool to:
 * 1. List all available skills
 * 2. Load and execute a skill's content with argument substitution
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ContentBlockParam } from "../skills/types.js";
import { 
  getAllSkills, 
  getSkillByName, 
  invokeSkill,
  type SkillCommand,
} from "../skills/index.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const skillSchema = Type.Object({
  name: Type.Optional(
    Type.String({ 
      description: "Name of the skill to invoke (e.g., 'review', 'test')",
    })
  ),
  args: Type.Optional(
    Type.String({ 
      description: "Arguments to pass to the skill (will substitute {{skill.args}} and <arg> placeholders)",
    })
  ),
  list: Type.Optional(
    Type.Boolean({ 
      description: "If true, list all available skills without invoking any",
    })
  ),
});

export type SkillInput = {
  name?: string;
  args?: string;
  list?: boolean;
};

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatSkillList(skills: SkillCommand[]): string {
  if (skills.length === 0) {
    return "No skills available.";
  }

  const lines: string[] = ["Available skills:\n"];
  
  for (const skill of skills) {
    const usage = skill.argumentHint
      ? `/${skill.name} ${skill.argumentHint}`
      : `/${skill.name}`;
    
    lines.push(`## ${skill.name}`);
    lines.push(`Usage: ${usage}`);
    lines.push(`Description: ${skill.description}`);
    
    if (skill.source !== "bundled") {
      lines.push(`Source: ${skill.source}`);
    } else {
      lines.push(`Source: bundled`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

function formatSkillResult(content: ContentBlockParam[]): string {
  return content.map(c => {
    if (c.type === "text") {
      return c.text;
    }
    // For other content types, stringify them
    return JSON.stringify(c);
  }).join("\n");
}

// ─── Execute Function ─────────────────────────────────────────────────────────

export async function executeSkill(
  _toolCallId: string,
  params: SkillInput
) {
  // List all skills
  if (params.list === true || (!params.name && !params.args)) {
    const allSkills = getAllSkills();
    return {
      content: [{ type: "text" as const, text: formatSkillList(allSkills) }],
      details: { skills: allSkills },
    };
  }

  // Require a skill name if not listing
  if (!params.name) {
    return {
      content: [{ 
        type: "text" as const, 
        text: "Error: Skill name is required when not listing skills. Use Skill(list: true) to see available skills.",
      }],
      details: {},
    };
  }

  // Find the skill
  const skill = getSkillByName(params.name);
  if (!skill) {
    const allSkills = getAllSkills();
    const suggestions = allSkills
      .filter(s => s.name.toLowerCase().includes(params.name!.toLowerCase()))
      .map(s => s.name);
    
    let message = `Skill not found: "${params.name}"`;
    if (suggestions.length > 0) {
      message += `\n\nDid you mean: ${suggestions.join(", ")}?`;
    } else {
      message += `\n\nUse Skill(list: true) to see all available skills.`;
    }
    
    return {
      content: [{ type: "text" as const, text: message }],
      details: {},
    };
  }

  // Invoke the skill
  const args = params.args ?? "";
  try {
    const content = await invokeSkill(skill, args, null);
    const text = formatSkillResult(content);
    
    return {
      content: [{ type: "text" as const, text }],
      details: { skill },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: `Error invoking skill "${skill.name}": ${errorMessage}` }],
      details: { skill },
    };
  }
}

// ─── Tool Definition Factory ──────────────────────────────────────────────────

export function createSkillToolDefinition(): ToolDefinition {
  return {
    name: "skill",
    label: "Skill",
    description:
      "Load and invoke a Koi skill.\n\n" +
      "Skills are reusable prompt templates that provide specialized workflows " +
      "for specific tasks (e.g., code review, testing, documentation).\n\n" +
      "Use this tool to:\n" +
      "- List all available skills (Skill(list: true))\n" +
      "- Invoke a skill with arguments (Skill(name: 'review', args: 'src/'))\n\n" +
      "When a skill matches the current task, use it to get specialized instructions.",
    promptSnippet: "Skill: load and invoke a skill",
    promptGuidelines: [
      "Use Skill(list: true) to see all available skills.",
      "When a task matches a skill's description, use Skill(name: '<skill>') to load specialized instructions.",
      "Skills may accept arguments - check the skill's argument_hint for usage.",
    ],
    parameters: skillSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeSkill(toolCallId, params as SkillInput);
    },
  };
}
