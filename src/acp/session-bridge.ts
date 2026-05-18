/**
 * ACP Session Bridge
 *
 * Maps ACP session IDs to Koi AgentSession instances.
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { McpServer } from "@agentclientprotocol/sdk/dist/schema";
import { globalTaskManager } from "../agent/session-tasks.js";
import {
  createNewSession,
  loadSession,
  listSessions,
  deleteSession as deleteSessionStore,
  type SessionMeta,
} from "../agent/session-store.js";
import type { McpServerConfig } from "../services/mcp/types.js";
import { acpLogger } from "./logger.js";

export interface AcpSessionEntry {
  sessionId: string;
  agentSession: AgentSession;
  abortController: AbortController;
}

function convertAcpMcpServer(server: McpServer): { name: string; config: McpServerConfig } {
  // Stdio servers have `command` but no `type` field in the ACP schema
  if ("command" in server) {
    const env: Record<string, string> = {};
    for (const e of server.env) {
      env[e.name] = e.value;
    }
    return {
      name: server.name,
      config: {
        type: "stdio",
        command: server.command,
        args: server.args,
        env,
      },
    };
  }

  // HTTP or SSE servers have `type` and `url`
  if ("type" in server && (server.type === "http" || server.type === "sse")) {
    const headers: Record<string, string> = {};
    for (const h of server.headers) {
      headers[h.name] = h.value;
    }
    return {
      name: server.name,
      config: {
        type: server.type,
        url: server.url,
        headers,
      },
    };
  }

  // Fallback for unknown types
  acpLogger.error("Unsupported MCP server type from ACP client");
  throw new Error("Unsupported MCP server type from ACP client");
}

class SessionBridge {
  private sessions = new Map<string, AcpSessionEntry>();

  async createSession(cwd: string, mcpServers?: McpServer[]): Promise<string> {
    const extraMcpServers = mcpServers?.map(convertAcpMcpServer);
    const result = await createNewSession(globalTaskManager, undefined, "startup", extraMcpServers);
    const sessionId = result.session.sessionId;
    this.sessions.set(sessionId, {
      sessionId,
      agentSession: result.session,
      abortController: new AbortController(),
    });
    acpLogger.info("Created ACP session:", sessionId, "cwd:", cwd);
    return sessionId;
  }

  async loadExistingSession(filePath: string, mcpServers?: McpServer[]): Promise<string> {
    const extraMcpServers = mcpServers?.map(convertAcpMcpServer);
    const result = await loadSession(filePath, globalTaskManager, undefined, extraMcpServers);
    const sessionId = result.session.sessionId;
    this.sessions.set(sessionId, {
      sessionId,
      agentSession: result.session,
      abortController: new AbortController(),
    });
    acpLogger.info("Loaded ACP session:", sessionId);
    return sessionId;
  }

  getSession(sessionId: string): AcpSessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  getAgentSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId)?.agentSession;
  }

  async listAllSessions(): Promise<SessionMeta[]> {
    return listSessions();
  }

  async closeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    entry.abortController.abort();
    entry.agentSession.dispose();
    this.sessions.delete(sessionId);
    acpLogger.info("Closed ACP session:", sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.closeSession(sessionId);
    // deleteSessionStore expects SessionMeta, but we only have id here.
    // Look up the meta first.
    const sessions = await listSessions();
    const meta = sessions.find((s) => s.id === sessionId);
    if (meta) {
      await deleteSessionStore(meta);
    }
  }

  async closeAllSessions(): Promise<void> {
    for (const [sessionId] of this.sessions) {
      await this.closeSession(sessionId);
    }
  }
}

export const sessionBridge = new SessionBridge();
