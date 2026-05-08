/**
 * LsTool — Directory listing
 *
 * Lists files and directories with basic metadata.
 */

import { Type } from "typebox";
import { readdirSync, statSync, existsSync } from "fs";
import { resolve } from "path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";

export const lsSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory to list (default: current directory)" })),
});

export type LsToolInput = {
  path?: string;
};

export async function executeLs(params: LsToolInput): Promise<{ content: TextContent[]; details: { entryCount: number } }> {
  const dirPath = params.path ? resolve(params.path) : process.cwd();

  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${params.path ?? "."}`);
  }

  const entries = readdirSync(dirPath);
  const lines: string[] = [];

  for (const name of entries) {
    const full = resolve(dirPath, name);
    try {
      const s = statSync(full);
      const type = s.isDirectory() ? "d" : s.isFile() ? "f" : "?";
      const size = s.isFile() ? String(s.size) : "-";
      lines.push(`${type}\t${size}\t${name}`);
    } catch {
      lines.push(`?\t-\t${name}`);
    }
  }

  const text = lines.length ? lines.join("\n") : "(empty directory)";
  return {
    content: [{ type: "text", text }],
    details: { entryCount: lines.length },
  };
}

export function createLsToolDefinition(_cwd: string): ToolDefinition<typeof lsSchema, { entryCount: number }> {
  return {
    name: "ls",
    label: "Ls",
    description: "List files and directories in a given path.",
    promptSnippet: "Ls: list directory contents",
    parameters: lsSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("ls", params);
      if (perm.decision === "deny") {
        return {
          content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "ls operation blocked"}` }],
          details: { entryCount: 0 },
          isError: true,
        } as any;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({ toolName: "ls", args: params, reason: perm.reason ?? "Confirm directory listing" });
        if (!allowed) {
          return {
            content: [{ type: "text", text: "User denied permission to list directory." }],
            details: { entryCount: 0 },
            isError: true,
          } as any;
        }
      }
      return await executeLs(params);
    },
  };
}
