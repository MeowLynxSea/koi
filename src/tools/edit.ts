/**
 * FileEditTool — Exact string replacement in files
 *
 * Features:
 * - Exact string matching with quote normalization (smart → straight quotes)
 * - Uniqueness check: old_string must be unique unless replace_all is true
 * - Diff generation using the `diff` library
 * - CRLF normalization and preservation on write
 */

import { Type } from "typebox";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { structuredPatch } from "diff";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { withWriteLock } from "../agent/tool-orchestration.js";
import type { ToolResultWithError } from "./types.js";

export const editSchema = Type.Object({
  path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
  old_string: Type.String({ description: "Exact text to replace. Must be unique in the file unless replace_all is true." }),
  new_string: Type.String({ description: "Replacement text" }),
  replace_all: Type.Optional(Type.Boolean({ description: "Replace all occurrences (default: false)" })),
});

export type EditToolInput = {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

// Smart quotes → straight quotes
function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2032\u2033]/g, "'");
}

function findActualString(fileContent: string, searchString: string): string | null {
  if (fileContent.includes(searchString)) {
    return searchString;
  }
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedFile = normalizeQuotes(fileContent);
  const idx = normalizedFile.indexOf(normalizedSearch);
  if (idx >= 0) {
    // Return the original substring from file (preserves original quote style)
    return fileContent.slice(idx, idx + searchString.length);
  }
  return null;
}

function generateDiff(filePath: string, oldContent: string, newContent: string): string {
  const patch = structuredPatch(filePath, filePath, oldContent, newContent, "", "", { context: 8 });
  if (!patch || patch.hunks.length === 0) return "";
  let result = `--- ${filePath}\n+++ ${filePath}\n`;
  for (const hunk of patch.hunks) {
    result += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
    for (const line of hunk.lines) {
      result += line + "\n";
    }
  }
  return result;
}

export async function executeEdit(params: EditToolInput): Promise<{ content: TextContent[]; details: { replacements: number } }> {
  const filePath = resolve(params.path);

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${params.path}`);
  }

  const buffer = readFileSync(filePath);
  const encoding = buffer[0] === 0xff && buffer[1] === 0xfe ? "utf16le" : "utf8";
  const originalContent = buffer.toString(encoding);
  const crlf = originalContent.includes("\r\n");
  const fileContent = originalContent.replace(/\r\n/g, "\n");

  if (params.old_string === params.new_string) {
    throw new Error("old_string and new_string are identical — no change needed.");
  }

  const actualOld = findActualString(fileContent, params.old_string);
  if (actualOld === null) {
    throw new Error(
      `Could not find the string to replace in ${params.path}.\n` +
      `Make sure old_string matches exactly (including indentation).`
    );
  }

  const matches = fileContent.split(actualOld).length - 1;
  if (matches > 1 && !params.replace_all) {
    throw new Error(
      `Found ${matches} matches of the string to replace, but replace_all is false.\n` +
      `To replace all occurrences, set replace_all to true. ` +
      `To replace only one occurrence, provide more context to uniquely identify the instance.`
    );
  }

  const newContent = params.replace_all
    ? fileContent.split(actualOld).join(params.new_string)
    : fileContent.replace(actualOld, params.new_string);

  const diff = generateDiff(params.path, fileContent, newContent);

  // Restore original line endings if file had CRLF
  const outputContent = crlf ? newContent.replace(/\n/g, "\r\n") : newContent;
  writeFileSync(filePath, outputContent, encoding as "utf-8");

  const replacementCount = params.replace_all ? matches : 1;
  const diffDisplay = diff ? `\n\nDiff:\n${diff}` : "";

  return {
    content: [{ type: "text", text: `File edited: ${params.path}${diffDisplay}` }],
    details: { replacements: replacementCount },
  };
}

export function createEditToolDefinition(_cwd: string): ToolDefinition<typeof editSchema, { replacements: number }> {
  return {
    name: "edit",
    label: "Edit",
    description:
      "Performs exact string replacements in files.\n\n" +
      "Usage:\n" +
      "- You must use your Read tool at least once in the conversation before editing.\n" +
      "- When editing text from Read tool output, preserve the exact indentation.\n" +
      "- ALWAYS prefer editing existing files. NEVER write new files unless required.\n" +
      "- The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more context or use replace_all.",
    promptSnippet: "Edit: targeted string replacement in existing files",
    parameters: editSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      return withWriteLock(async () => {
        const perm = checkPermission("edit", params);
        if (perm.decision === "deny") {
          const result: ToolResultWithError<{ replacements: number }> = {
            content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "edit operation blocked"}` }],
            details: { replacements: 0 },
            isError: true,
          };
          return result;
        }
        if (perm.decision === "ask") {
          const allowed = await requestPermission({ toolName: "edit", args: params, reason: perm.reason ?? "Confirm file edit" });
          if (!allowed) {
            const result: ToolResultWithError<{ replacements: number }> = {
              content: [{ type: "text", text: "User denied permission to edit file." }],
              details: { replacements: 0 },
              isError: true,
            };
            return result;
          }
        }
        return await executeEdit(params);
      });
    },
  };
}
