/**
 * Frontmatter Parser for SKILL.md files
 *
 * Parses YAML frontmatter from skill markdown files.
 */

import yaml from "yaml";

export interface RawFrontmatter {
  // Allow any keys but also provide explicit accessors
  [key: string]: unknown;
  name?: unknown;
  description?: unknown;
  Description?: unknown;
  when_to_use?: unknown;
  whenToUse?: unknown;
  "argument-hint"?: unknown;
  argumentHint?: unknown;
  ArgumentHint?: unknown;
  arguments?: unknown;
  Arguments?: unknown;
  "allowed-tools"?: unknown;
  allowedTools?: unknown;
  allowed_tools?: unknown;
  model?: unknown;
  Model?: unknown;
  "disable-model-invocation"?: unknown;
  disableModelInvocation?: unknown;
  "user-invocable"?: unknown;
  userInvocable?: unknown;
  hooks?: unknown;
  Hooks?: unknown;
  context?: unknown;
  Context?: unknown;
  agent?: unknown;
  Agent?: unknown;
  effort?: unknown;
  Effort?: unknown;
  paths?: unknown;
  Paths?: unknown;
  shell?: unknown;
  Shell?: unknown;
  version?: unknown;
  Version?: unknown;
}

/**
 * Type guard to check if a value is a plain object
 */
function isRecord(value: unknown): value is RawFrontmatter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns the parsed frontmatter and the remaining content
 */
export function parseFrontmatter(content: string): {
  frontmatter: RawFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const parsedYaml: unknown = yaml.parse(match[1]!);
    const frontmatter: RawFrontmatter = isRecord(parsedYaml) ? parsedYaml : {};
    const body = match[2] ?? "";
    return { frontmatter, body };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Convert array or string frontmatter value to array
 */
export function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    return value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Parse frontmatter to structured fields
 */
export function parseFrontmatterFields(
  frontmatter: RawFrontmatter,
  _body: string,
  fileName: string
): {
  name?: string;
  description?: string | string[];
  when_to_use?: string;
  argument_hint?: string;
  arguments?: string[];
  allowed_tools?: string[];
  model?: string;
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  hooks?: { "pre-task"?: string[]; "post-task"?: string[] };
  context?: "fork" | "inline";
  agent?: string;
  effort?: string;
  paths?: string[];
  shell?: { name?: string; command?: string; env?: Record<string, string> };
  version?: string;
} {
  const name =
    (frontmatter.name as string) ??
    fileName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const description = frontmatter.description ?? frontmatter.Description;
  const whenToUse = frontmatter.when_to_use ?? frontmatter.whenToUse;
  const argumentHint = frontmatter["argument-hint"] ?? frontmatter.argumentHint ?? frontmatter.ArgumentHint;
  const argumentsList = frontmatter.arguments ?? frontmatter.Arguments;
  const allowedTools = frontmatter["allowed-tools"] ?? frontmatter.allowedTools ?? frontmatter.allowed_tools;
  const model = frontmatter.model ?? frontmatter.Model;
  const disableModelInvocation = frontmatter["disable-model-invocation"] ?? frontmatter.disableModelInvocation ?? false;
  const userInvocable = frontmatter["user-invocable"] ?? frontmatter.userInvocable ?? true;
  const hooks = frontmatter.hooks ?? frontmatter.Hooks;
  const context = frontmatter.context ?? frontmatter.Context;
  const agent = frontmatter.agent ?? frontmatter.Agent;
  const effort = frontmatter.effort ?? frontmatter.Effort;
  const paths = frontmatter.paths ?? frontmatter.Paths;
  const shell = frontmatter.shell ?? frontmatter.Shell;
  const version = frontmatter.version ?? frontmatter.Version;

  return {
    name,
    description: description !== undefined ? toArray(description) : undefined,
    when_to_use: whenToUse as string | undefined,
    argument_hint: argumentHint as string | undefined,
    arguments: argumentsList ? toArray(argumentsList) : undefined,
    allowed_tools: allowedTools ? toArray(allowedTools) : undefined,
    model: model as string | undefined,
    disable_model_invocation: disableModelInvocation as boolean,
    user_invocable: userInvocable as boolean,
    hooks: hooks as { "pre-task"?: string[]; "post-task"?: string[] } | undefined,
    context: context as "fork" | "inline" | undefined,
    agent: agent as string | undefined,
    effort: effort as string | undefined,
    paths: paths ? toArray(paths) : undefined,
    shell: shell as { name?: string; command?: string; env?: Record<string, string> } | undefined,
    version: version as string | undefined,
  };
}

/**
 * Extract argument names from argument hint string
 * e.g., "<file> <target>" -> ["file", "target"]
 */
export function extractArgNames(argumentHint?: string): string[] | undefined {
  if (!argumentHint) return undefined;

  const matches = argumentHint.matchAll(/<([^>]+)>/g);
  const names: string[] = [];
  for (const match of matches) {
    names.push(match[1]!);
  }

  return names.length > 0 ? names : undefined;
}

/**
 * Estimate token count for content (rough approximation)
 */
export function estimateTokens(content: string): number {
  // Rough approximation: ~4 characters per token
  return Math.ceil(content.length / 4);
}
