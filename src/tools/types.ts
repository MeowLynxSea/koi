/**
 * Tool metadata and shared types for Koi's custom tool system.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

export interface ToolMetadata {
  name: string;
  isReadOnly: boolean;
  isDestructive: boolean;
  riskLevel: "low" | "medium" | "high";
}

export const TOOL_METADATA: Record<string, ToolMetadata> = {
  read: { name: "read", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  grep: { name: "grep", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  glob: { name: "glob", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  ls: { name: "ls", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  bash: { name: "bash", isReadOnly: false, isDestructive: true, riskLevel: "high" },
  edit: { name: "edit", isReadOnly: false, isDestructive: false, riskLevel: "medium" },
  write: { name: "write", isReadOnly: false, isDestructive: true, riskLevel: "medium" },
  webfetch: { name: "webfetch", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  taskCreate: { name: "taskCreate", isReadOnly: false, isDestructive: false, riskLevel: "low" },
  taskGet: { name: "taskGet", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  taskList: { name: "taskList", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  taskUpdate: { name: "taskUpdate", isReadOnly: false, isDestructive: false, riskLevel: "low" },
  askUserQuestion: { name: "askUserQuestion", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  enterPlanMode: { name: "enterPlanMode", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  exitPlanMode: { name: "exitPlanMode", isReadOnly: true, isDestructive: false, riskLevel: "low" },
  agent: { name: "agent", isReadOnly: false, isDestructive: false, riskLevel: "medium" },
};

export type KoiToolName = keyof typeof TOOL_METADATA;

export function isReadOnlyTool(name: string): boolean {
  return TOOL_METADATA[name]?.isReadOnly ?? false;
}

export function isDestructiveTool(name: string): boolean {
  return TOOL_METADATA[name]?.isDestructive ?? false;
}

export type AnyToolDefinition = ToolDefinition;

/** AgentToolResult with optional isError flag for permission denials. */
export type ToolResultWithError<T> = AgentToolResult<T> & { isError?: boolean };

/** Extract a readable message from an unknown error value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
