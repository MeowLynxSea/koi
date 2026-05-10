/**
 * SendToMonitor Tool — 向 Monitor 内进程发送输入
 *
 * 允许 agent 向运行中的 monitor PTY 会话发送输入，
 * 支持交互式命令（如 sudo 密码、确认提示等）。
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { monitorRegistry } from "../agent/monitor-registry.js";
import type { ToolResultWithError } from "./types.js";

export const sendToMonitorSchema = Type.Object({
  monitorId: Type.String({
    description: "The ID of the monitor to send input to.",
  }),
  input: Type.String({
    description:
      "The input string to send to the monitor's PTY. " +
      "For passwords, type the password and it will be sent to the PTY. " +
      "For newlines, include \\n in the string or use sendLine: true.",
  }),
  sendLine: Type.Optional(
    Type.Boolean({
      description:
        "If true, append a newline after the input (equivalent to pressing Enter). " +
        "Default: false (raw input without newline).",
      default: false,
    })
  ),
  interrupt: Type.Optional(
    Type.Boolean({
      description:
        "If true, send Ctrl+C to interrupt the running process instead of sending text input. " +
        "When set to true, the 'input' parameter is ignored.",
      default: false,
    })
  ),
});

export type SendToMonitorInput = {
  monitorId: string;
  input: string;
  sendLine?: boolean;
  interrupt?: boolean;
};

export function createSendToMonitorToolDefinition(): ToolDefinition<
  typeof sendToMonitorSchema,
  { success: boolean; monitorId: string }
> {
  return {
    name: "SendToMonitor",
    label: "SendToMonitor",
    description:
      "Send input to a running monitor's PTY process.\n\n" +
      "Use this tool when:\n" +
      "- A monitor prompts for a password (e.g., sudo)\n" +
      "- A monitor asks for confirmation (y/n)\n" +
      "- You need to interact with an interactive command running in a monitor\n\n" +
      "The input is sent directly to the PTY, completely bypassing any terminal UI,\n" +
      "ensuring no sensitive information is leaked to the outer environment.",
    promptSnippet: "SendToMonitor: send input to a background monitor process",
    parameters: sendToMonitorSchema,
    executionMode: "parallel",
    async execute(
      _toolCallId,
      params: SendToMonitorInput
    ): Promise<{
      content: TextContent[];
      details: { success: boolean; monitorId: string };
    }> {
      const monitor = monitorRegistry.get(params.monitorId);

      if (!monitor) {
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

      if (monitor.status !== "running") {
        const result: ToolResultWithError<{ success: boolean; monitorId: string }> = {
          content: [
            {
              type: "text",
              text: `Monitor ${params.monitorId} is not running (status: ${monitor.status}).`,
            } satisfies TextContent,
          ],
          details: { success: false, monitorId: params.monitorId },
          isError: true,
        };
        return result;
      }

      const session = monitorRegistry.getSession(params.monitorId);
      if (!session) {
        const result: ToolResultWithError<{ success: boolean; monitorId: string }> = {
          content: [
            {
              type: "text",
              text: `Monitor ${params.monitorId} session not found (may have already exited).`,
            } satisfies TextContent,
          ],
          details: { success: false, monitorId: params.monitorId },
          isError: true,
        };
        return result;
      }

      let success = false;

      // Send interrupt (Ctrl+C) if requested
      if (params.interrupt) {
        success = monitorRegistry.interrupt(params.monitorId);
        return {
          content: [
            {
              type: "text",
              text: success
                ? `Interrupt (Ctrl+C) sent to monitor ${params.monitorId}.`
                : `Monitor ${params.monitorId} could not be interrupted.`,
            } satisfies TextContent,
          ],
          details: { success, monitorId: params.monitorId },
        };
      }

      // Send input to PTY
      if (params.sendLine) {
        monitorRegistry.sendLine(params.monitorId, params.input);
      } else {
        monitorRegistry.write(params.monitorId, params.input);
      }
      success = true;

      // Mask password in output for display (but keep it in details if needed for debugging)
      const displayInput = params.input.length > 0 && params.input === params.input.trim()
        ? "••••••••"
        : params.input;

      return {
        content: [
          {
            type: "text",
            text: `Input sent to monitor ${params.monitorId}: ${params.sendLine ? displayInput + "\\n" : displayInput}`,
          } satisfies TextContent,
        ],
        details: { success, monitorId: params.monitorId },
      };
    },
  };
}
