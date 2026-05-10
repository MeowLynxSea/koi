/**
 * Skills System Type Definitions
 *
 * Defines the core types for Koi's Skills functionality.
 * Skills are reusable prompt templates with metadata that can be invoked
 * via slash commands (e.g., /review, /test).
 */

/**
 * Content block type for skill prompts.
 * Simplified version of the AI SDK's ContentBlockParam type.
 */
export type ContentBlockParam = 
  | { type: "text"; text: string }
  | { type: "image"; image: string | Uint8Array }
  | { type: "tool_result"; toolResultId: string; content: string }
  | { type: "tool_use"; tool: string; args: Record<string, unknown> };

/**
 * Hooks configuration for skills
 */
export interface HooksSettings {
  "pre-task"?: string[];
  "post-task"?: string[];
}

/**
 * Frontmatter shell configuration
 */
export interface FrontmatterShell {
  name?: string;
  command?: string;
  env?: Record<string, string>;
}

/**
 * Context passed to skill prompt generators
 */
export interface ToolUseContext {
  tools: Record<string, (...args: unknown[]) => unknown>;
  env: Record<string, unknown>;
  cwd: string;
}

/**
 * Skill loaded from source
 */
export type SkillLoadedFrom = 
  | "skills"      // Loaded from skills directory
  | "commands"     // Loaded from commands directory (legacy)
  | "plugin"       // From a plugin
  | "bundled"      // Built-in bundled skill
  | "mcp";         // From MCP server

/**
 * Skill configuration source
 */
export type SkillSource = 
  | "userSettings"      // User's global skills (~/.config/koi/skills)
  | "projectSettings"   // Project-level skills (.claude/skills)
  | "policySettings"    // Policy-defined skills
  | "plugin"            // From a plugin
  | "bundled"           // Built-in bundled skill
  | "mcp";              // From MCP server

/**
 * Parsed frontmatter fields from SKILL.md
 */
export interface ParsedFields {
  name?: string;
  description?: string | string[];
  when_to_use?: string;
  argument_hint?: string;
  arguments?: string | string[];
  allowed_tools?: string | string[];
  model?: string;
  disable_model_invocation?: boolean;
  user_invocable?: boolean;
  hooks?: HooksSettings;
  context?: "fork" | "inline";
  agent?: string;
  effort?: string;
  paths?: string | string[];
  shell?: FrontmatterShell;
  version?: string;
}

/**
 * A skill command that can be invoked
 */
export interface SkillCommand {
  type: "prompt";
  name: string;
  description: string;
  hasUserSpecifiedDescription: boolean;
  allowedTools: string[];
  argumentHint?: string;
  argNames?: string[];
  whenToUse?: string;
  version?: string;
  model?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  context?: "fork" | "inline";
  agent?: string;
  effort?: string;
  paths?: string[];
  contentLength: number;
  isHidden: boolean;
  progressMessage: string;
  source: SkillSource;
  loadedFrom: SkillLoadedFrom;
  hooks?: HooksSettings;
  skillRoot?: string;
  /**
   * Generate the prompt content for this skill with given arguments
   */
  getPromptForCommand: (args: string, ctx: ToolUseContext) => Promise<ContentBlockParam[]>;
}

/**
 * A skill with its source file path
 */
export interface SkillWithPath {
  skill: SkillCommand;
  filePath: string;
}

/**
 * Bundled skill definition (used for registration)
 */
export interface BundledSkillDefinition {
  name: string;
  description: string;
  aliases?: string[];
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  model?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  isEnabled?: () => boolean;
  hooks?: HooksSettings;
  context?: "inline" | "fork";
  agent?: string;
  effort?: string;
  template?: string;
  files?: Record<string, string>;
  getPromptForCommand: (args: string, ctx: ToolUseContext) => Promise<ContentBlockParam[]>;
}

/**
 * Skill invocation result
 */
export interface SkillInvocationResult {
  success: boolean;
  content?: ContentBlockParam[];
  error?: string;
}

/**
 * Frontmatter parsed from a SKILL.md file
 */
export interface SkillFrontmatter {
  name?: string;
  description?: string | string[];
  when_to_use?: string;
  "argument-hint"?: string;
  arguments?: string | string[];
  "allowed-tools"?: string | string[];
  model?: string;
  "disable-model-invocation"?: boolean;
  "user-invocable"?: boolean;
  hooks?: HooksSettings;
  context?: "fork" | "inline";
  agent?: string;
  effort?: string;
  paths?: string | string[];
  shell?: FrontmatterShell;
  version?: string;
}

/**
 * Skill file info for discovery
 */
export interface SkillFileInfo {
  path: string;
  name: string;
  root: string;
  source: SkillSource;
  loadedFrom: SkillLoadedFrom;
}

/**
 * Dynamic skill loading event
 */
export interface SkillsLoadedEvent {
  skills: SkillCommand[];
  source: SkillSource;
  timestamp: number;
}
