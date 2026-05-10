/**
 * BashTool — Shell execution with safety controls
 *
 * Features:
 * - Timeout with SIGTERM → SIGKILL escalation
 * - Output size limit (capped to prevent context overflow)
 * - Dangerous command warnings (displayed but not blocking)
 */

import { Type } from "typebox";
import { spawn } from "child_process";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission, isDangerousBashCommand } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { withWriteLock } from "../agent/tool-orchestration.js";
import type { ToolResultWithError } from "./types.js";

export const bashSchema = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)", default: 60 })),
});

export type BashToolInput = {
  command: string;
  timeout?: number;
};

const MAX_OUTPUT_CHARS = 200_000;

function execBash(command: string, timeoutSec?: number): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const shellFlag = process.platform === "win32" ? "/c" : "-c";
    const child = spawn(shell, [shellFlag, command], {
      cwd: process.cwd(),
      env: { ...process.env, CLAUDECODE: "1", GIT_EDITOR: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const effectiveTimeout = timeoutSec ?? 60;
    if (effectiveTimeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
      }, effectiveTimeout * 1000);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length + stderr.length > MAX_OUTPUT_CHARS * 2) {
        child.kill("SIGKILL");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stdout.length + stderr.length > MAX_OUTPUT_CHARS * 2) {
        child.kill("SIGKILL");
      }
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ stdout, stderr, exitCode: code ?? 0, timedOut });
    });
  });
}

export async function executeBash(params: BashToolInput): Promise<{ content: TextContent[]; details: { exitCode: number; timedOut: boolean } }> {
  const { stdout, stderr, exitCode, timedOut } = await execBash(params.command, params.timeout);

  let output = stdout;
  if (stderr) {
    output += (output ? "\n\n" : "") + `[stderr]\n${stderr}`;
  }
  if (timedOut) {
    output += "\n\n[Command timed out and was terminated]";
  }
  if (output.length > MAX_OUTPUT_CHARS) {
    output = output.slice(0, MAX_OUTPUT_CHARS) + `\n\n[Output truncated: ${output.length} chars total, limit: ${MAX_OUTPUT_CHARS}]`;
  }

  const warning = isDangerousBashCommand(params.command)
    ? "\n\n[Warning: This command may be destructive. Proceed with caution.]"
    : "";

  return {
    content: [{ type: "text", text: output + warning }],
    details: { exitCode, timedOut },
  };
}

export function createBashToolDefinition(_cwd: string): ToolDefinition<typeof bashSchema, { exitCode: number; timedOut: boolean }> {
  return {
    name: "bash",
    label: "Bash",
    description:
      "Execute a bash command in the environment.\n\n" +
      "IMPORTANT: Avoid using this tool to run `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands. " +
      "Instead, use the appropriate dedicated tool.\n\n" +
      "Git Safety Protocol:\n" +
      "- NEVER update the git config\n" +
      "- NEVER run destructive git commands (push --force, reset --hard, checkout .) unless explicitly requested\n" +
      "- NEVER use git commands with the -i flag (interactive)\n" +
      "- NEVER skip hooks (--no-verify, --no-gpg-sign) unless explicitly asked",
    promptSnippet: "Bash: execute shell commands (last resort — prefer dedicated tools)",
    parameters: bashSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      return withWriteLock(async () => {
        const perm = checkPermission("bash", params);
        if (perm.decision === "deny") {
          const result: ToolResultWithError<{ exitCode: number; timedOut: boolean }> = {
            content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "bash operation blocked"}` }],
            details: { exitCode: 1, timedOut: false },
            isError: true,
          };
          return result;
        }
        if (perm.decision === "ask") {
          const allowed = await requestPermission({ toolName: "bash", args: params, reason: perm.reason ?? "Confirm shell command" });
          if (!allowed) {
            const result: ToolResultWithError<{ exitCode: number; timedOut: boolean }> = {
              content: [{ type: "text", text: "User denied permission to execute command." }],
              details: { exitCode: 1, timedOut: false },
              isError: true,
            };
            return result;
          }
        }
        return await executeBash(params);
      });
    },
  };
}
