/**
 * Koi Session Store
 *
 * Manages multiple AgentSessions: listing, creating, loading, switching, and
 * persisting Koi-specific per-session UI state (UIMessage[], collapsed states).
 * Builds on top of Pi's SessionManager for underlying JSONL persistence.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import type { AgentSession, CreateAgentSessionResult, SessionInfo } from "@mariozechner/pi-coding-agent";
import type { UIMessage } from "../tui/components/chat-panel.js";
import type { ModelRef } from "../config/settings.js";
import {
  getPiAuthStorage,
  getPiModelRegistry,
  getPiSettingsManager,
  getCurrentPiModel,
} from "../config/settings.js";
import { createCodingToolDefinitions } from "../tools/index.js";
import type { SessionTaskManager } from "./session-tasks.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const KOI_SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const PI_AGENT_DIR = path.join(CONFIG_DIR, "pi");

export interface SessionMeta {
  id: string;
  title: string;
  filePath: string;
  cwd: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface KoiSessionState {
  sessionId: string;
  title: string;
  currentModel: ModelRef | null;
  auxiliaryModel: ModelRef | null;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getKoiSessionDir(sessionId: string): string {
  return path.join(KOI_SESSIONS_DIR, sessionId);
}

function getKoiStatePath(sessionId: string): string {
  return path.join(getKoiSessionDir(sessionId), "koi-state.json");
}

function sessionInfoToMeta(info: SessionInfo): SessionMeta {
  return {
    id: info.id,
    title: info.name || info.firstMessage || "Untitled Session",
    filePath: info.path,
    cwd: info.cwd,
    createdAt: info.created,
    updatedAt: info.modified,
    messageCount: info.messageCount,
  };
}

/* ───────── Public API ───────── */

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    const infos = await SessionManager.listAll();
    return infos.map(sessionInfoToMeta);
  } catch {
    return [];
  }
}

export async function createNewSession(
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);

  const authStorage = getPiAuthStorage();
  const modelRegistry = getPiModelRegistry();
  const settingsManager = getPiSettingsManager();
  const currentModel = getCurrentPiModel();

  const sessionManager = SessionManager.create(process.cwd());
  const customTools = createCodingToolDefinitions(process.cwd(), taskManager);

  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage,
    modelRegistry,
    settingsManager,
    model: currentModel,
    noTools: "builtin",
    customTools,
    sessionManager,
  });

  // Save initial koi-state
  const now = Date.now();
  const state: KoiSessionState = {
    sessionId: result.session.sessionId,
    title: "New Session",
    currentModel: currentModel ? { provider: currentModel.provider, modelId: currentModel.id } : null,
    auxiliaryModel: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  saveKoiState(result.session.sessionId, state);

  return result;
}

export async function loadSession(
  filePath: string,
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);

  const authStorage = getPiAuthStorage();
  const modelRegistry = getPiModelRegistry();
  const settingsManager = getPiSettingsManager();
  const currentModel = getCurrentPiModel();

  const sessionManager = SessionManager.open(filePath, undefined, process.cwd());
  const customTools = createCodingToolDefinitions(process.cwd(), taskManager);

  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage,
    modelRegistry,
    settingsManager,
    model: currentModel,
    noTools: "builtin",
    customTools,
    sessionManager,
  });

  return result;
}

export async function continueRecentSession(
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);

  const authStorage = getPiAuthStorage();
  const modelRegistry = getPiModelRegistry();
  const settingsManager = getPiSettingsManager();
  const currentModel = getCurrentPiModel();

  const sessionManager = SessionManager.continueRecent(process.cwd());
  const customTools = createCodingToolDefinitions(process.cwd(), taskManager);

  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage,
    modelRegistry,
    settingsManager,
    model: currentModel,
    noTools: "builtin",
    customTools,
    sessionManager,
  });

  return result;
}

export function saveKoiState(sessionId: string, state: KoiSessionState): void {
  try {
    const dir = getKoiSessionDir(sessionId);
    ensureDir(dir);
    const filePath = getKoiStatePath(sessionId);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // Silently ignore write errors
  }
}

export function loadKoiState(sessionId: string): KoiSessionState | null {
  try {
    const filePath = getKoiStatePath(sessionId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as KoiSessionState;
  } catch {
    return null;
  }
}

export function deleteKoiSessionData(sessionId: string): void {
  try {
    const dir = getKoiSessionDir(sessionId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

/**
 * Build UIMessage array from AgentSession.messages as a fallback when
 * koi-state.json is missing. This is a best-effort reconstruction.
 */
export function buildUIMessagesFromAgentSession(session: AgentSession): UIMessage[] {
  const messages = session.messages;
  const uiMessages: UIMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      let content = "";
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");
      }
      uiMessages.push({
        id: `user-${msg.timestamp}`,
        type: "user",
        content,
      });
    } else if (msg.role === "assistant") {
      let text = "";
      let thinking = "";
      for (const block of msg.content) {
        if (block.type === "text") {
          text += block.text;
        } else if (block.type === "thinking") {
          thinking += (block as any).thinking || "";
        }
      }
      uiMessages.push({
        id: `agent-${msg.timestamp}`,
        type: "agent",
        content: text,
        thinking: thinking || undefined,
        thinkingCollapsed: true,
      });
    }
    // tool_result messages are skipped in fallback reconstruction
    // because we don't have the original args from AgentMessage alone.
  }

  return uiMessages;
}
