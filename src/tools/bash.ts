/**
 * BashTool — Shell execution with PTY isolation
 *
 * Features:
 * - PTY-based execution (full terminal isolation)
 * - No I/O leakage to outer environment
 * - Timeout handling: transfer to monitor instead of killing
 * - Support for interactive commands (sudo, vim, etc.)
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission, isDangerousBashCommand } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { withWriteLock } from "../agent/tool-orchestration.js";
import { monitorRegistry } from "../agent/monitor-registry.js";
import { spawnPty, PtySession, generatePtyId } from "./pty.js";
import { activeSessionRef } from "../agent/hooks.js";
import type { ToolResultWithError } from "./types.js";

export const bashSchema = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60). For long-running tasks that exceed this limit, use CreateMonitor instead.", default: 60 })),
});

export type BashToolInput = {
  command: string;
  timeout?: number;
};

const MAX_OUTPUT_CHARS = 200_000;

export interface BashResult {
  content: TextContent[];
  details: {
    exitCode?: number;
    timedOut: boolean;
    monitorId?: string;
  };
}

/**
 * Execute bash command with PTY and timeout handling.
 * 
 * If timeout occurs:
 *   - Does NOT kill the process
 *   - Transfers the PTY to a new monitor
 *   - Returns the monitor ID for the agent to continue
 * 
 * This ensures complete I/O isolation - no password prompts or
 * interactive input/output can leak to the outer environment.
 */
async function execBashWithPty(
  command: string,
  timeoutSec: number = 60,
  onData?: (data: string) => void,
  signal?: AbortSignal,
  onTimeout?: (monitorId: string) => void
): Promise<{
  exitCode?: number;
  output: string;
  timedOut: boolean;
  transferredMonitorId?: string;
  session?: PtySession;
}> {
  type ExecBashResult = {
    exitCode?: number;
    output: string;
    timedOut: boolean;
    transferredMonitorId?: string;
    session?: PtySession;
  };
  const sessionId = activeSessionRef.current?.sessionId ?? "unknown";
  const ptyId = generatePtyId();

  let output = "";
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let resolvePromise: ((value: ExecBashResult) => void) | undefined;

  // Create PTY - spawnPty handles platform differences internally
  const ptyProcess = spawnPty({
    command: command,
  });

  // Collect output directly from PTY (no PtySession wrapper)
  ptyProcess.onData((data: string) => {
    output += data;
    onData?.(data);
  });

  const ptySession = new PtySession(ptyId, ptyProcess, command);

  // Set up timeout
  if (timeoutSec > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;

      // DO NOT kill the process - transfer to monitor instead
      const monitorId = monitorRegistry.adopt(
        ptySession,
        sessionId,
        command,
        `Bash timeout transfer: ${command.slice(0, 50)}${command.length > 50 ? "…" : ""}`
      );
      
      // Clean up the old session's listeners so only monitor receives events
      ptySession.cleanup();

      // Notify caller about the timeout
      onTimeout?.(monitorId);

      // Notify via signal if available
      signal?.removeEventListener("abort", onAbort);

      // Resolve the promise now
      resolvePromise?.({
        exitCode: undefined,
        output,
        timedOut: true,
        transferredMonitorId: monitorId,
        session: undefined,
      });
    }, timeoutSec * 1000);
  }

  // Handle abort signal
  const onAbort = () => {
    if (!timedOut) {
      ptySession?.kill("SIGTERM");
    }
  };
  signal?.addEventListener("abort", onAbort);

  // Wait for PTY exit
  return new Promise((resolve) => {
    resolvePromise = resolve;
    ptyProcess.onExit(({ exitCode }) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);

      resolve({
        exitCode: exitCode ?? 0,
        output,
        timedOut: false,
        transferredMonitorId: undefined,
        session: undefined,
      });
    });
  });
}

export async function executeBash(params: BashToolInput): Promise<BashResult> {
  let monitorId: string | undefined;
  
  const { exitCode, output, timedOut, transferredMonitorId } = await execBashWithPty(
    params.command,
    params.timeout,
    undefined,
    undefined,
    (id) => { monitorId = id; }
  );
  
  // Use the monitorId from callback if available
  if (timedOut && !monitorId) {
    monitorId = transferredMonitorId;
  }

  let displayOutput = output;

  // Truncate if needed
  if (displayOutput.length > MAX_OUTPUT_CHARS) {
    displayOutput =
      displayOutput.slice(0, MAX_OUTPUT_CHARS) +
      `\n\n[Output truncated: ${output.length} chars total, limit: ${MAX_OUTPUT_CHARS}]`;
  }

  // Warning for dangerous commands
  const warning = isDangerousBashCommand(params.command)
    ? "\n\n[Warning: This command may be destructive. Proceed with caution.]"
    : "";

  if (timedOut && monitorId) {
    // Timeout occurred - process transferred to monitor
    return {
      content: [
        {
          type: "text",
          text:
            `Command timed out after ${params.timeout}s.\n\n` +
            `The process has been transferred to a background monitor.\n\n` +
            `Monitor ID: ${monitorId}\n` +
            `Use SendToMonitor to provide input (e.g., passwords) or InterruptMonitor to stop it.\n\n` +
            `Latest output:\n${displayOutput.slice(-2000)}${warning}`,
        } satisfies TextContent,
      ],
      details: { exitCode: undefined, timedOut: true, monitorId },
    };
  }

  // Normal completion
  return {
    content: [{ type: "text", text: displayOutput + warning }],
    details: { exitCode, timedOut: false },
  };
}

export function createBashToolDefinition(_cwd: string): ToolDefinition<typeof bashSchema, { exitCode?: number; timedOut: boolean; monitorId?: string }> {
  return {
    name: "bash",
    label: "Bash",
    description:
      "Execute a bash command in the environment with full PTY isolation.\n\n" +
      "IMPORTANT: Avoid using this tool to run `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands. " +
      "Instead, use the appropriate dedicated tool.\n\n" +
      "Git Safety Protocol:\n" +
      "- NEVER update the git config\n" +
      "- NEVER run destructive git commands (push --force, reset --hard, checkout .) unless explicitly requested\n" +
      "- NEVER use git commands with the -i flag (interactive)\n" +
      "- NEVER skip hooks (--no-verify, --no-gpg-sign) unless explicitly asked\n\n" +
      "Timeout Handling:\n" +
      "If the command times out, it will be transferred to a background monitor instead of being killed. " +
      "Use SendToMonitor to interact with the process (e.g., enter sudo passwords).",
    promptSnippet: "Bash: execute shell commands with PTY isolation (last resort — prefer dedicated tools)",
    parameters: bashSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      return withWriteLock(async () => {
        const perm = checkPermission("bash", params);
        if (perm.decision === "deny") {
          const result: ToolResultWithError<{ exitCode?: number; timedOut: boolean; monitorId?: string }> = {
            content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "bash operation blocked"}` }],
            details: { exitCode: 1, timedOut: false },
            isError: true,
          };
          return result;
        }
        if (perm.decision === "ask") {
          const allowed = await requestPermission({ toolName: "bash", args: params, reason: perm.reason ?? "Confirm shell command" });
          if (!allowed) {
            const result: ToolResultWithError<{ exitCode?: number; timedOut: boolean; monitorId?: string }> = {
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
