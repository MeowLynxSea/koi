/**
 * GrepTool — ripgrep wrapper for content search
 *
 * Built on ripgrep with safe defaults:
 *   --hidden, --glob !VCS, --max-columns 500, auto -e prefix for patterns starting with -
 */

import { Type } from "typebox";
import { spawn } from "child_process";
import { resolve } from "path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import type { ToolResultWithError } from "./types.js";

export const grepSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
  path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
  glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
  output_mode: Type.Optional(Type.Union(
    [Type.Literal("content"), Type.Literal("files_with_matches"), Type.Literal("count")],
    { description: 'Output mode: "content" | "files_with_matches" | "count" (default: content)' }
  )),
  context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
  "-i": Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
  multiline: Type.Optional(Type.Boolean({ description: "Enable multiline matching (default: false)" })),
  head_limit: Type.Optional(Type.Number({ description: "Maximum number of result lines to return (default: 250)" })),
});

export type GrepToolInput = {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  context?: number;
  "-i"?: boolean;
  multiline?: boolean;
  head_limit?: number;
};

const VCS_DIRS = [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"];
const DEFAULT_HEAD_LIMIT = 250;

function buildRgArgs(input: GrepToolInput): string[] {
  const args: string[] = [];

  args.push("--hidden");
  for (const dir of VCS_DIRS) {
    args.push("--glob", `!${dir}`);
  }
  args.push("--max-columns", "500");

  if (input.multiline) {
    args.push("-U", "--multiline-dotall");
  }
  if (input["-i"]) {
    args.push("-i");
  }

  const mode = input.output_mode ?? "content";
  if (mode === "files_with_matches") {
    args.push("-l");
  } else if (mode === "count") {
    args.push("-c");
  }

  if (mode === "content") {
    if (input.context !== undefined && input.context > 0) {
      args.push("-C", String(input.context));
    }
    args.push("-n"); // line numbers
  }

  if (input.glob) {
    args.push("--glob", input.glob);
  }

  // Pattern: prefix with -e if it starts with -
  const pattern = input.pattern;
  if (pattern.startsWith("-")) {
    args.push("-e", pattern);
  } else {
    args.push(pattern);
  }

  const searchPath = input.path ? resolve(input.path) : process.cwd();
  args.push(searchPath);

  return args;
}

function buildGrepArgs(input: GrepToolInput): string[] {
  const args: string[] = [];

  args.push("-r", "-n");

  // Exclude VCS dirs
  for (const dir of VCS_DIRS) {
    args.push("--exclude-dir", dir);
  }

  if (input["-i"]) {
    args.push("-i");
  }

  const mode = input.output_mode ?? "content";
  if (mode === "files_with_matches") {
    args.push("-l");
  } else if (mode === "count") {
    args.push("-c");
  }

  if (mode === "content" && input.context !== undefined && input.context > 0) {
    args.push("-C", String(input.context));
  }

  if (input.glob) {
    args.push("--include", input.glob);
  }

  args.push("-e", input.pattern);

  const searchPath = input.path ? resolve(input.path) : process.cwd();
  args.push(searchPath);

  return args;
}

function execSearch(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf-8"); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

export async function executeGrep(params: GrepToolInput): Promise<{ content: TextContent[]; details: { matches: number; truncated: boolean } }> {
  let stdout: string;
  let stderr: string;
  let exitCode: number;

  try {
    const args = buildRgArgs(params);
    ({ stdout, stderr, exitCode } = await execSearch("rg", args));
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // ripgrep not installed — fallback to system grep
      const args = buildGrepArgs(params);
      ({ stdout, stderr, exitCode } = await execSearch("grep", args));
    } else {
      throw err;
    }
  }

  if (exitCode !== 0 && exitCode !== 1) {
    // ripgrep exits 1 when no matches, >1 for errors
    throw new Error(stderr || `ripgrep exited with code ${exitCode}`);
  }

  const limit = params.head_limit ?? DEFAULT_HEAD_LIMIT;
  const lines = stdout.split("\n");
  const truncated = lines.length > limit;
  const output = truncated ? lines.slice(0, limit).join("\n") : stdout;

  let text = output;
  if (truncated) {
    text += `\n\n[Showing results with pagination = limit: ${limit}, offset: 0]`;
  }
  if (stderr) {
    text += `\n\n(stderr: ${stderr.trim()})`;
  }

  const matchCount = exitCode === 0 ? (params.output_mode === "count" ? lines.length - 1 : lines.filter((l) => l.trim()).length) : 0;

  return {
    content: [{ type: "text", text }],
    details: { matches: matchCount, truncated },
  };
}

export function createGrepToolDefinition(_cwd: string): ToolDefinition<typeof grepSchema, { matches: number; truncated: boolean }> {
  return {
    name: "grep",
    label: "Grep",
    description:
      "A powerful search tool built on ripgrep.\n\n" +
      "Usage:\n" +
      "- ALWAYS use Grep for search tasks. NEVER invoke `grep` or `rg` as a Bash command.\n" +
      "- Supports full regex syntax (e.g. \"log.*Error\", \"function\\s+\\w+\")\n" +
      "- Filter files with glob parameter (e.g. \"*.js\", \"**/*.tsx\")\n" +
      "- Output modes: \"content\" shows matching lines, \"files_with_matches\" shows only file paths, \"count\" shows match counts\n" +
      "- Pattern syntax: Uses ripgrep — literal braces need escaping (use `interface\\{}` to find `interface{}` in Go code)\n" +
      "- Multiline matching: For cross-line patterns, use multiline: true",
    promptSnippet: "Grep: search file contents with ripgrep (regex, glob filters, context lines)",
    parameters: grepSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("grep", params);
      if (perm.decision === "deny") {
        const result: ToolResultWithError<{ matches: number; truncated: boolean }> = {
          content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "grep operation blocked"}` }],
          details: { matches: 0, truncated: false },
          isError: true,
        };
        return result;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({ toolName: "grep", args: params as GrepToolInput, reason: perm.reason ?? "Confirm search" });
        if (!allowed) {
          const result: ToolResultWithError<{ matches: number; truncated: boolean }> = {
            content: [{ type: "text", text: "User denied permission to search." }],
            details: { matches: 0, truncated: false },
            isError: true,
          };
          return result;
        }
      }
      return await executeGrep(params);
    },
  };
}
