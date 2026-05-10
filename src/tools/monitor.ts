/**
 * Monitor Tool — Background Process Watcher
 *
 * Creates a background monitor that watches command output and notifies
 * the main agent via steer() (when busy) or prompt() (when idle).
 *
 * Notifications are sent as internal XML tags filtered from UI but visible to LLM.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import { monitorRegistry } from "../agent/monitor-registry.js";
import { activeSessionRef } from "../agent/hooks.js";
import type { ToolResultWithError } from "./types.js";

// ─── CreateMonitor ────────────────────────────────────────────────────────────

export const createMonitorSchema = Type.Object({
  command: Type.String({
    description:
      "The bash command to run and monitor. " +
      "The monitor will watch stdout/stderr and notify on each output line.",
  }),
  description: Type.Optional(
    Type.String({
      description: "Human-readable label for this monitor (shown in sidebar).",
    })
  ),
});

export type CreateMonitorInput = {
  command: string;
  description?: string;
};

// ─── CancelMonitor ────────────────────────────────────────────────────────────

export const cancelMonitorSchema = Type.Object({
  monitorId: Type.String({
    description: "The ID of the monitor to cancel.",
  }),
});

export type CancelMonitorInput = {
  monitorId: string;
};

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export function createMonitorToolDefinition(): ToolDefinition<
  typeof createMonitorSchema,
  { monitorId: string }
> {
  return {
    name: "CreateMonitor",
    label: "CreateMonitor",
    description:
      "Start a background process monitor that watches command output. " +
      "Each line of output is sent as a notification to the main agent. " +
      "Use CancelMonitor to stop a running monitor. " +
      "Useful for watching log files, CI/CD pipelines, long-running scripts, or directory changes.",
    promptSnippet: "Monitor: watch background command output",
    parameters: createMonitorSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: CreateMonitorInput) {
      // Permission check — same rules as bash
      const perm = checkPermission("bash", { command: params.command });
      if (perm.decision === "deny") {
        const result: ToolResultWithError<{ monitorId: string }> = {
          content: [
            { type: "text", text: `Permission denied: ${perm.reason ?? "operation blocked"}` },
          ],
          details: { monitorId: "" },
          isError: true,
        };
        return result;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({
          toolName: "bash",
          args: { command: params.command },
          reason: perm.reason ?? "Confirm background monitor command",
        });
        if (!allowed) {
          const result: ToolResultWithError<{ monitorId: string }> = {
            content: [{ type: "text", text: "User denied permission to start monitor." }],
            details: { monitorId: "" },
            isError: true,
          };
          return result;
        }
      }

      const sessionId = activeSessionRef.current?.sessionId ?? "unknown";
      const monitorId = monitorRegistry.launch(sessionId, params.command, params.description ?? "");

      return {
        content: [
          {
            type: "text",
            text: `Monitor started with ID: ${monitorId}\nCommand: ${params.command}`,
          } satisfies TextContent,
        ],
        details: { monitorId },
      };
    },
  };
}

export function createCancelMonitorToolDefinition(): ToolDefinition<
  typeof cancelMonitorSchema,
  { success: boolean; monitorId: string }
> {
  return {
    name: "CancelMonitor",
    label: "CancelMonitor",
    description:
      "Cancel a running background monitor. " +
      "The monitored process will be terminated (SIGTERM, then SIGKILL).",
    promptSnippet: "CancelMonitor: stop a background monitor",
    parameters: cancelMonitorSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params: CancelMonitorInput) {
      const existing = monitorRegistry.get(params.monitorId);
      if (!existing) {
        const result: ToolResultWithError<{ success: boolean; monitorId: string }> = {
          content: [
            {
              type: "text",
              text: `Monitor not found: ${params.monitorId}`,
            } satisfies TextContent,
          ],
          details: { success: false, monitorId: params.monitorId },
          isError: true,
        };
        return result;
      }

      const killed = monitorRegistry.kill(params.monitorId);

      const content: TextContent[] = [
        {
          type: "text",
          text: killed
            ? `Monitor ${params.monitorId} cancelled.`
            : `Monitor ${params.monitorId} could not be cancelled (process may have already exited).`,
        },
      ];

      return {
        content,
        details: { success: killed, monitorId: params.monitorId },
      };
    },
  };
}
