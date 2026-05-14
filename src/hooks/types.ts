/**
 * Hook System Types
 *
 * Core types for the hook execution engine.
 * Structurally compatible with Claude Code's hook types.
 */

import type { HookEvent } from "../plugins/types.js";
export type { HookEvent } from "../plugins/types.js";
export { HOOK_EVENTS } from "../plugins/types.js";

// ============================================================================
// Hook Commands
// ============================================================================

export interface BaseHook {
  type: "command" | "prompt" | "agent" | "http" | "function";
  if?: string;
  timeout?: number;
  statusMessage?: string;
  once?: boolean;
}

export interface CommandHook extends BaseHook {
  type: "command";
  command: string;
  shell?: "bash" | "powershell";
  async?: boolean;
  asyncRewake?: boolean;
}

export interface PromptHook extends BaseHook {
  type: "prompt";
  prompt: string;
  model?: string;
}

export interface AgentHook extends BaseHook {
  type: "agent";
  prompt: string;
  model?: string;
}

export interface HttpHook extends BaseHook {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  allowedEnvVars?: string[];
}

export interface FunctionHook extends BaseHook {
  type: "function";
  fn: (input: HookInput) => HookJSONOutput | Promise<HookJSONOutput>;
}

export type HookCommand = CommandHook | PromptHook | AgentHook | HttpHook | FunctionHook;

export interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

export type HooksSettings = Partial<Record<HookEvent, HookMatcher[]>>;

// ============================================================================
// Hook Input
// ============================================================================

export interface HookInput {
  event: HookEvent;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  tool_error?: string;
  prompt?: string;
  session_id?: string;
  cwd?: string;
  file_path?: string;
  task_id?: string;
  task_description?: string;
  config_key?: string;
  config_value?: unknown;
  source?: "startup" | "resume" | "clear" | "compact";
  trigger?: "init" | "maintenance" | "manual" | "auto";
  reason?: "clear" | "logout" | "prompt_input_exit" | "other";
  custom_instructions?: string | null;
  compact_summary?: string;
  permission_request?: {
    tool_name: string;
    tool_input: Record<string, unknown>;
  };
  permission_denied?: {
    tool_name: string;
    tool_input: Record<string, unknown>;
    reason?: string;
  };
  [key: string]: unknown;
}

// ============================================================================
// Hook Output
// ============================================================================

export interface HookSpecificOutput {
  hookEventName?: HookEvent;
  permissionDecision?: "ask" | "deny" | "allow" | "passthrough";
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  watchPaths?: string[];
  retry?: boolean;
  updatedMCPToolOutput?: unknown;
  initialUserMessage?: string;
  worktreePath?: string;
}

export interface HookJSONOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: HookSpecificOutput;
  async?: boolean;
  asyncTimeout?: number;
}

export interface AsyncHookJSONOutput extends HookJSONOutput {
  async: true;
}

export interface SyncHookJSONOutput extends HookJSONOutput {
  async?: false;
}

// ============================================================================
// Hook Result
// ============================================================================

export type HookOutcome = "success" | "blocking" | "non_blocking_error" | "cancelled";

export interface HookResult {
  outcome: HookOutcome;
  message?: string;
  systemMessage?: string;
  blockingError?: string;
  preventContinuation?: boolean;
  stopReason?: string;
  permissionBehavior?: "ask" | "deny" | "allow" | "passthrough";
  additionalContext?: string;
  updatedInput?: Record<string, unknown>;
  retry?: boolean;
  hook: HookCommand;
}

export interface AggregatedHookResult {
  outcomes: HookOutcome[];
  preventContinuation: boolean;
  stopReason?: string;
  systemMessages: string[];
  permissionBehavior?: "ask" | "deny" | "allow" | "passthrough";
  additionalContext?: string;
  updatedInput?: Record<string, unknown>;
  retry?: boolean;
  errors: string[];
}

// ============================================================================
// Plugin Hook Matcher (with plugin context)
// ============================================================================

export interface PluginHookMatcher {
  matcher?: string;
  hooks: HookCommand[];
  pluginRoot: string;
  pluginName: string;
  pluginId: string;
}

// ============================================================================
// Callback Hook
// ============================================================================

export type HookCallback = (input: HookInput) => HookJSONOutput | Promise<HookJSONOutput> | boolean | Promise<boolean>;

export interface RegisteredCallbackHook {
  event: HookEvent;
  callback: HookCallback;
  id: string;
}
