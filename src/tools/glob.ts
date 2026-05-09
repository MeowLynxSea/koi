/**
 * GlobTool — Fast file pattern matching
 *
 * Supports glob patterns like "** /*.js" or "src/** /*.ts".
 * Returns matching file paths sorted by modification time.
 */

import { Type } from "typebox";
import { resolve } from "path";
import { statSync } from "fs";
import fg from "fast-glob";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import type { ToolResultWithError } from "./types.js";

export const globSchema = Type.Object({
  pattern: Type.String({ description: "Glob pattern to match files, e.g. '**/*.ts' or 'src/**/*.tsx'" }),
  path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
});

export type GlobToolInput = {
  pattern: string;
  path?: string;
};

const MAX_RESULTS = 100;

export async function executeGlob(params: GlobToolInput): Promise<{ content: TextContent[]; details: { count: number; truncated: boolean } }> {
  const cwd = params.path ? resolve(params.path) : process.cwd();
  const entries = await fg(params.pattern, {
    cwd,
    dot: true,
    absolute: false,
    onlyFiles: true,
  });

  // Sort by modification time (most recent first)
  const withMtime = entries.map((rel) => {
    const full = resolve(cwd, rel);
    try {
      const mtime = statSync(full).mtimeMs;
      return { rel, mtime };
    } catch {
      return { rel, mtime: 0 };
    }
  });
  withMtime.sort((a, b) => b.mtime - a.mtime);

  const sorted = withMtime.map((e) => e.rel);
  const truncated = sorted.length > MAX_RESULTS;
  const output = sorted.slice(0, MAX_RESULTS);

  let text = output.join("\n");
  if (truncated) {
    text += `\n\n... (${sorted.length - MAX_RESULTS} more files hidden, limit: ${MAX_RESULTS})`;
  }

  return {
    content: [{ type: "text", text }],
    details: { count: sorted.length, truncated },
  };
}

export function createGlobToolDefinition(_cwd: string): ToolDefinition<typeof globSchema, { count: number; truncated: boolean }> {
  return {
    name: "glob",
    label: "Glob",
    description:
      "Fast file pattern matching tool that works with any codebase size.\n\n" +
      "- Supports glob patterns like \"**/*.js\" or \"src/**/*.ts\"\n" +
      "- Returns matching file paths sorted by modification time\n" +
      "- Use this tool when you need to find files by name patterns",
    promptSnippet: "Glob: find files by glob pattern (**/*.ts, etc.)",
    parameters: globSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("glob", params);
      if (perm.decision === "deny") {
        const result: ToolResultWithError<{ count: number; truncated: boolean }> = {
          content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "glob operation blocked"}` }],
          details: { count: 0, truncated: false },
          isError: true,
        };
        return result;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({ toolName: "glob", args: params, reason: perm.reason ?? "Confirm file search" });
        if (!allowed) {
          const result: ToolResultWithError<{ count: number; truncated: boolean }> = {
            content: [{ type: "text", text: "User denied permission to search files." }],
            details: { count: 0, truncated: false },
            isError: true,
          };
          return result;
        }
      }
      return await executeGlob(params);
    },
  };
}
