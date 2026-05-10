/**
 * Argument Substitution for Skills
 *
 * Handles {{skill.args}} and <arg> placeholders in skill prompts.
 */

import type { ToolUseContext } from "./types.js";

/**
 * Substitute arguments in skill content
 * Supports {{skill.args}}, {{skill.arg.name}}, and <name> placeholders
 */
export function substituteArguments(
  content: string,
  args: string,
  strict: boolean,
  argNames?: string[]
): string {
  let result = content;

  // Replace {{skill.args}} with the full argument string
  result = result.replace(/\{\{skill\.args\}\}/g, args);

  // If argNames are provided, try to parse named arguments
  if (argNames && argNames.length > 0) {
    const parsedArgs = parseNamedArguments(args, argNames);
    
    // Replace {{skill.arg.name}} patterns
    result = result.replace(/\{\{skill\.arg\.(\w+)\}\}/g, (match, name) => {
      const value = parsedArgs[name as keyof typeof parsedArgs];
      return value ?? (strict ? match : "");
    });

    // Replace <name> patterns with values
    for (const [name, value] of Object.entries(parsedArgs)) {
      result = result.replace(new RegExp(`<${name}>`, "g"), value);
    }
  }

  // Replace remaining <...> placeholders with args (for backward compatibility)
  result = result.replace(/<[^>]+>/g, (match) => {
    if (match === args) return args; // If the whole thing is the args, keep it
    return match; // Leave other placeholders as-is
  });

  return result;
}

/**
 * Parse named arguments from a string
 * e.g., "file.ts --flag value" with argNames ["file", "flag"]
 * -> { file: "file.ts", flag: "value" }
 */
export function parseNamedArguments(args: string, argNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = args.trim().split(/\s+/).filter(Boolean);

  let partIndex = 0;
  for (const name of argNames) {
    if (partIndex >= parts.length) {
      result[name] = "";
      continue;
    }

    const part = parts[partIndex]!;

    // Check if this part looks like a named argument (--name or --name=value)
    if (part.startsWith("--")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx !== -1) {
        // --name=value format
        const argName = part.slice(2, eqIdx);
        const argValue = part.slice(eqIdx + 1);
        result[argName] = argValue;
        partIndex++;
      } else {
        // --name value format
        result[name] = parts[partIndex + 1] ?? "";
        partIndex += 2;
      }
    } else if (part.startsWith("-")) {
      // Single dash flag
      result[name] = part;
      partIndex++;
    } else {
      // Positional argument
      result[name] = part;
      partIndex++;
    }
  }

  return result;
}

/**
 * Parse argument names from arguments frontmatter
 * e.g., "<file> <target>" -> ["file", "target"]
 */
export function parseArgumentNames(argumentsFrontmatter?: string | string[]): string[] {
  if (!argumentsFrontmatter) return [];

  const args = Array.isArray(argumentsFrontmatter) 
    ? argumentsFrontmatter 
    : argumentsFrontmatter.split(/\s+/);

  return args.map(arg => arg.replace(/[<>]/g, "").trim()).filter(Boolean);
}

/**
 * Execute shell commands in skill prompt
 * Supports !`command` and ```! ... ``` syntax
 */
export async function executeShellCommandsInPrompt(
  content: string,
  _ctx: ToolUseContext,
  skillName: string
): Promise<string> {
  // For now, we'll just strip shell commands as execution requires careful handling
  // This is a simplified version - full implementation would execute and replace
  
  let result = content;

  // Remove inline shell commands: !`command`
  result = result.replace(/!`([^`]+)`/g, (_, cmd) => {
    // In a full implementation, this would execute the command
    // and replace the !`...` with the output
    console.log(`[skill:${skillName}] Would execute: ${cmd}`);
    return `[shell output placeholder: ${cmd}]`;
  });

  // Remove block shell commands: ```! ... ```
  result = result.replace(/```!([\s\S]*?)```/g, (_, cmd: string) => {
    const trimmedCmd = cmd.trim();
    console.log(`[skill:${skillName}] Would execute block: ${trimmedCmd}`);
    return `[shell output placeholder]`;
  });

  return result;
}

/**
 * Substitute environment variables in content
 */
export function substituteEnvVariables(
  content: string,
  env: Record<string, unknown>,
  sessionId?: string,
  skillDir?: string
): string {
  let result = content;

  // Replace ${CLAUDE_SKILL_DIR}
  if (skillDir) {
    result = result.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
  }

  // Replace ${CLAUDE_SESSION_ID}
  if (sessionId) {
    result = result.replace(/\$\{CLAUDE_SESSION_ID\}/g, sessionId);
  }

  // Replace ${ENV:VAR_NAME}
  result = result.replace(/\$\{ENV:(\w+)\}/g, (_, varName) => {
    const value = env[varName as keyof typeof env];
    return value !== undefined ? String(value) : "";
  });

  return result;
}
