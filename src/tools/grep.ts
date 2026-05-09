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

/**
 * Argument Builders
 *
 * buildRgArgs builds ripgrep flags; buildGrepArgs is the POSIX-grep fallback.
 * addVcsExcludes, addModeFlags, addPattern are shared building blocks.
 */

function addVcsExcludes(args: string[], cmd: "rg" | "grep"): void {
  if (cmd === "rg") {
    for (const dir of VCS_DIRS) {
      args.push("--glob", `!${dir}`);
    }
  } else {
    for (const dir of VCS_DIRS) {
      args.push("--exclude-dir", dir);
    }
  }
}

function addModeFlags(args: string[], mode: string, cmd: "rg" | "grep", context?: number): void {
  if (mode === "files_with_matches") {
    args.push("-l");
  } else if (mode === "count") {
    args.push("-c");
  }

  if (mode === "content") {
    if (context !== undefined && context > 0) {
      args.push("-C", String(context));
    }
    if (cmd === "rg") args.push("-n");
  }
}

function addPattern(args: string[], pattern: string): void {
  if (pattern.startsWith("-")) {
    args.push("-e", pattern);
  } else {
    args.push(pattern);
  }
}

function buildRgArgs(input: GrepToolInput): string[] {
  const args: string[] = ["--hidden", "--max-columns", "500"];
  addVcsExcludes(args, "rg");

  if (input.multiline) args.push("-U", "--multiline-dotall");
  if (input["-i"]) args.push("-i");

  addModeFlags(args, input.output_mode ?? "content", "rg", input.context);

  if (input.glob) args.push("--glob", input.glob);
  addPattern(args, input.pattern);
  args.push(input.path ? resolve(input.path) : process.cwd());

  return args;
}

function buildGrepArgs(input: GrepToolInput): string[] {
  const args: string[] = ["-r", "-n"];
  addVcsExcludes(args, "grep");

  if (input["-i"]) args.push("-i");
  addModeFlags(args, input.output_mode ?? "content", "grep", input.context);

  if (input.glob) args.push("--include", input.glob);
  args.push("-e", input.pattern);
  args.push(input.path ? resolve(input.path) : process.cwd());

  return args;
}

/**
 * Execution
 *
 * Tries ripgrep first; on ENOENT falls back to system grep.
 * Exit code 1 from ripgrep means "no matches" — not an error.
 */

interface SearchResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function execSearch(cmd: string, args: string[]): Promise<SearchResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf-8"); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
  });
}

function truncateOutput(stdout: string, stderr: string, limit: number): { text: string; truncated: boolean } {
  const lines = stdout.split("\n");
  const truncated = lines.length > limit;
  let text = truncated ? lines.slice(0, limit).join("\n") : stdout;

  if (truncated) {
    text += `\n\n[Showing results with pagination = limit: ${limit}, offset: 0]`;
  }
  if (stderr) {
    text += `\n\n(stderr: ${stderr.trim()})`;
  }

  return { text, truncated };
}

function countMatches(exitCode: number, outputMode: string | undefined, lines: string[]): number {
  if (exitCode !== 0) return 0;
  if (outputMode === "count") return lines.length - 1;
  return lines.filter((l) => l.trim()).length;
}

export async function executeGrep(params: GrepToolInput): Promise<{
  content: TextContent[];
  details: { matches: number; truncated: boolean };
}> {
  let result: SearchResult;

  try {
    result = await execSearch("rg", buildRgArgs(params));
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      result = await execSearch("grep", buildGrepArgs(params));
    } else {
      throw err;
    }
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(result.stderr || `ripgrep exited with code ${result.exitCode}`);
  }

  const limit = params.head_limit ?? DEFAULT_HEAD_LIMIT;
  const { text, truncated } = truncateOutput(result.stdout, result.stderr, limit);
  const matchCount = countMatches(result.exitCode, params.output_mode, result.stdout.split("\n"));

  return {
    content: [{ type: "text", text }],
    details: { matches: matchCount, truncated },
  };
}

/** Factory helpers for permission-denied tool results. */

function buildDeniedResult(): ToolResultWithError<{ matches: number; truncated: boolean }> {
  return {
    content: [{ type: "text", text: "Permission denied: grep operation blocked" }],
    details: { matches: 0, truncated: false },
    isError: true,
  };
}

function buildUserDeniedResult(): ToolResultWithError<{ matches: number; truncated: boolean }> {
  return {
    content: [{ type: "text", text: "User denied permission to search." }],
    details: { matches: 0, truncated: false },
    isError: true,
  };
}

/**
 * ToolDefinition Factory
 *
 * Registers the grep tool with the Pi agent runtime.
 */

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
      if (perm.decision === "deny") return buildDeniedResult();
      if (perm.decision === "ask") {
        const allowed = await requestPermission({
          toolName: "grep",
          args: params as GrepToolInput,
          reason: perm.reason ?? "Confirm search",
        });
        if (!allowed) return buildUserDeniedResult();
      }
      return await executeGrep(params);
    },
  };
}
