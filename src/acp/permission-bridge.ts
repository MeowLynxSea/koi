/**
 * ACP Permission Bridge
 *
 * Bridges Koi's permission system to ACP's requestPermission protocol.
 */

import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import { acpLogger } from "./logger.js";

let activeConnection: AgentSideConnection | null = null;
let activeSessionId: string | null = null;

export function setActiveAcpConnection(
  connection: AgentSideConnection,
  sessionId: string
): void {
  activeConnection = connection;
  activeSessionId = sessionId;
}

export function clearActiveAcpConnection(): void {
  activeConnection = null;
  activeSessionId = null;
}

export async function acpRequestPermission(params: {
  toolName: string;
  args: unknown;
  reason: string;
}): Promise<boolean> {
  if (!activeConnection || !activeSessionId) {
    acpLogger.warn(
      "ACP permission requested but no active connection/session"
    );
    return false;
  }

  const toolCallId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  acpLogger.info(
    "Requesting ACP permission for",
    params.toolName,
    "session:",
    activeSessionId
  );

  const response = await activeConnection.requestPermission({
    sessionId: activeSessionId,
    toolCall: {
      toolCallId,
      title: params.toolName,
      status: "pending",
      rawInput: params.args,
    },
    options: [
      {
        optionId: "allow",
        name: "Allow",
        kind: "allow_once",
      },
      {
        optionId: "reject",
        name: "Reject",
        kind: "reject_once",
      },
    ],
  });

  if (response.outcome.outcome === "cancelled") {
    acpLogger.info("ACP permission cancelled");
    return false;
  }

  const allowed = response.outcome.optionId === "allow";
  acpLogger.info("ACP permission result:", allowed ? "allowed" : "rejected");
  return allowed;
}

export function isAcpMode(): boolean {
  return process.env["KOI_ACP_MODE"] === "1";
}
