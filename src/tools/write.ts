/**
 * FileWriteTool — Full file write
 *
 * Overwrites existing files or creates new ones.
 * Forces LF line endings on write.
 */

import { Type } from "typebox";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { withWriteLock } from "../agent/tool-orchestration.js";
import type { ToolResultWithError } from "./types.js";

export const writeSchema = Type.Object({
  path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
  content: Type.String({ description: "Content to write to the file" }),
});

export type WriteToolInput = {
  path: string;
  content: string;
};

export async function executeWrite(params: WriteToolInput): Promise<{ content: TextContent[]; details: { bytesWritten: number } }> {
  const filePath = resolve(params.path);
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Force LF line endings
  const normalized = params.content.replace(/\r\n/g, "\n");
  writeFileSync(filePath, normalized, "utf-8");

  return {
    content: [{ type: "text", text: `File written: ${params.path}` }],
    details: { bytesWritten: Buffer.byteLength(normalized, "utf-8") },
  };
}

export function createWriteToolDefinition(_cwd: string): ToolDefinition<typeof writeSchema, { bytesWritten: number }> {
  return {
    name: "write",
    label: "Write",
    description:
      "Writes a file to the local filesystem.\n\n" +
      "- This tool will overwrite the existing file if there is one at the provided path.\n" +
      "- If this is an existing file, you MUST use the Read tool first.\n" +
      "- Prefer the Edit tool for modifying existing files — it only sends the diff.\n" +
      "- Only use this tool to create new files or for complete rewrites.",
    promptSnippet: "Write: create or overwrite a file (prefer Edit for partial changes)",
    parameters: writeSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      return withWriteLock(async () => {
        const perm = checkPermission("write", params);
        if (perm.decision === "deny") {
          const result: ToolResultWithError<{ bytesWritten: number }> = {
            content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "write operation blocked"}` }],
            details: { bytesWritten: 0 },
            isError: true,
          };
          return result;
        }
        if (perm.decision === "ask") {
          const allowed = await requestPermission({ toolName: "write", args: params, reason: perm.reason ?? "Confirm file write" });
          if (!allowed) {
            const result: ToolResultWithError<{ bytesWritten: number }> = {
              content: [{ type: "text", text: "User denied permission to write file." }],
              details: { bytesWritten: 0 },
              isError: true,
            };
            return result;
          }
        }
        return await executeWrite(params);
      });
    },
  };
}
