/**
 * Tool metadata and shared types for Koi's custom tool system.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

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
};

export type KoiToolName = keyof typeof TOOL_METADATA;

export function isReadOnlyTool(name: string): boolean {
  return TOOL_METADATA[name]?.isReadOnly ?? false;
}

export function isDestructiveTool(name: string): boolean {
  return TOOL_METADATA[name]?.isDestructive ?? false;
}

export type AnyToolDefinition = ToolDefinition<any, any, any>;
