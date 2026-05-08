/**
 * FileReadTool — 多格式文件阅读器
 *
 * Supports plain text files with line-range reading.
 * Image / PDF / Notebook support can be added in future iterations.
 */

import { Type } from "typebox";
import { readFileSync, statSync, existsSync } from "fs";
import { resolve } from "path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";

export const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

export type ReadToolInput = {
  path: string;
  offset?: number;
  limit?: number;
};

const BLOCKED_PATHS = [
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/tty",
  "/dev/console",
  "/dev/stdout",
  "/dev/stderr",
];

function isBlockedPath(p: string): boolean {
  const normalized = p.toLowerCase().replace(/\\/g, "/");
  return BLOCKED_PATHS.some((bp) => normalized.startsWith(bp.toLowerCase()));
}

function readFileInRange(filePath: string, offset?: number, limit?: number): { content: string; totalLines: number } {
  const buf = readFileSync(filePath, "utf-8");
  const allLines = buf.split("\n");
  const totalLines = allLines.length;

  const start = offset ? Math.max(0, offset - 1) : 0;
  const end = limit !== undefined ? start + limit : allLines.length;
  const sliced = allLines.slice(start, end);

  return { content: sliced.join("\n"), totalLines };
}

export async function executeRead(
  _toolCallId: string,
  params: ReadToolInput
): Promise<{ content: TextContent[]; details: { path: string; totalLines: number; readLines: number } }> {
  const filePath = resolve(params.path);

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${params.path}`);
  }

  if (isBlockedPath(filePath)) {
    throw new Error(`Reading from device/special paths is not allowed: ${params.path}`);
  }

  const stats = statSync(filePath);
  if (stats.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${params.path}`);
  }

  if (stats.size > 256 * 1024 * 1024) {
    throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(1)} MiB). Use a more targeted approach.`);
  }

  const { content, totalLines } = readFileInRange(filePath, params.offset, params.limit);
  const readLines = content.split("\n").length;

  return {
    content: [{ type: "text", text: content }],
    details: { path: filePath, totalLines, readLines },
  };
}

export function createReadToolDefinition(cwd: string): ToolDefinition<typeof readSchema, { path: string; totalLines: number; readLines: number }> {
  return {
    name: "read",
    label: "Read",
    description: "Reads a file from the local filesystem.",
    promptSnippet: "Read: reads files (text, images, PDFs, notebooks). Use absolute paths.",
    promptGuidelines: [
      "The file_path parameter must be an absolute path",
      "By default, reads up to 2000 lines from the beginning",
      "If you read a file that exists but has empty contents you will receive a system reminder warning",
    ],
    parameters: readSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("read", params);
      if (perm.decision === "deny") {
        return {
          content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "read operation blocked"}` }],
          details: { path: params.path, totalLines: 0, readLines: 0 },
          isError: true,
        } as any;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({ toolName: "read", args: params, reason: perm.reason ?? "Confirm file read" });
        if (!allowed) {
          return {
            content: [{ type: "text", text: "User denied permission to read the file." }],
            details: { path: params.path, totalLines: 0, readLines: 0 },
            isError: true,
          } as any;
        }
      }
      return await executeRead(toolCallId, params);
    },
  };
}
