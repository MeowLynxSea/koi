/**
 * Plugin Core Types
 *
 * TypeScript interfaces for the plugin system.
 * Designed to be structurally compatible with Claude Code's plugin types.
 */

import type { McpServerConfig } from "../services/mcp/types.js";

// ============================================================================
// Hook Types (forward-declared; full definitions in src/hooks/types.ts)
// ============================================================================

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Notification"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "StopFailure"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PostCompact"
  | "PermissionRequest"
  | "PermissionDenied"
  | "Setup"
  | "TeammateIdle"
  | "TaskCreated"
  | "TaskCompleted"
  | "Elicitation"
  | "ElicitationResult"
  | "ConfigChange"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "InstructionsLoaded"
  | "CwdChanged"
  | "FileChanged";

export const HOOK_EVENTS: HookEvent[] = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "PermissionDenied",
  "Setup",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
];

export type HooksSettings = Partial<Record<HookEvent, HookMatcher[]>>;

// Placeholder; real HookCommand defined in src/hooks/types.ts
export interface HookCommand {
  type: "command" | "prompt" | "agent" | "http" | "function";
  [key: string]: unknown;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

// ============================================================================
// Plugin Manifest
// ============================================================================

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface CommandMetadata {
  source?: string;
  content?: string;
  description?: string;
  argumentHint?: string;
  model?: string;
  allowedTools?: string[];
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  dependencies?: string[];

  // Component paths (relative to plugin root)
  commands?: string | string[] | Record<string, CommandMetadata>;
  agents?: string | string[];
  skills?: string | string[];
  outputStyles?: string | string[];
  hooks?: string | HooksSettings | (string | HooksSettings)[];

  // MCP / LSP
  mcpServers?: string | Record<string, McpServerConfig> | (string | Record<string, McpServerConfig>)[];
  lspServers?: string | Record<string, unknown> | (string | Record<string, unknown>)[];

  // Settings cascade
  settings?: Record<string, unknown>;

  // User-configurable options
  userConfig?: Record<string, PluginUserConfigOption>;
}

export interface PluginUserConfigOption {
  type: "string" | "number" | "boolean" | "directory" | "file";
  title: string;
  description: string;
  required?: boolean;
  default?: string | number | boolean | string[];
  multiple?: boolean;
  sensitive?: boolean;
  min?: number;
  max?: number;
}

// ============================================================================
// Loaded Plugin
// ============================================================================

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
  path: string;
  source: string;
  repository: string;
  enabled?: boolean;
  isBuiltin?: boolean;
  sha?: string;

  // Resolved component paths
  commandsPath?: string;
  commandsPaths?: string[];
  commandsMetadata?: Record<string, CommandMetadata>;
  agentsPath?: string;
  agentsPaths?: string[];
  skillsPath?: string;
  skillsPaths?: string[];
  outputStylesPath?: string;
  outputStylesPaths?: string[];
  hooksConfig?: HooksSettings;
  mcpServers?: Record<string, McpServerConfig>;
  lspServers?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// ============================================================================
// Built-in Plugin
// ============================================================================

export interface BuiltinPluginDefinition {
  name: string;
  description: string;
  version?: string;
  skills?: Array<{ name: string; description: string; content: string }>;
  hooks?: HooksSettings;
  mcpServers?: Record<string, McpServerConfig>;
  isAvailable?: () => boolean;
  defaultEnabled?: boolean;
}

// ============================================================================
// Plugin Error
// ============================================================================

export type PluginComponent =
  | "commands"
  | "agents"
  | "skills"
  | "hooks"
  | "output-styles"
  | "mcpServers"
  | "lspServers";

export type PluginError =
  | { type: "path-not-found"; source: string; plugin?: string; path: string; component: PluginComponent }
  | { type: "manifest-parse-error"; source: string; plugin?: string; manifestPath: string; parseError: string }
  | { type: "manifest-validation-error"; source: string; plugin?: string; manifestPath: string; validationErrors: string[] }
  | { type: "component-load-failed"; source: string; plugin?: string; component: PluginComponent; details: string }
  | { type: "generic-error"; source: string; plugin?: string; message: string };

// ============================================================================
// Plugin Settings
// ============================================================================

export interface PluginSettingsSection {
  enabledPlugins?: string[];
  pluginSettings?: Record<string, Record<string, unknown>>;
  hooks?: HooksSettings;
  allowedHttpHookUrls?: string[];
  allowedEnvVars?: string[];
}
