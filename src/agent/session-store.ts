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
import { forkManager } from "./session-fork.js";

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
  /** Fork source session ID (null for original sessions) */
  forkedFrom: string | null;
  /** Depth in the fork tree (0 for original, incremented for each fork level) */
  forkDepth: number;
  /** List of session IDs that were forked from this session */
  childForks: string[];
}

export interface KoiSessionState {
  sessionId: string;
  title: string;
  currentModel: ModelRef | null;
  auxiliaryModel: ModelRef | null;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;

  // === Fork-related state ===
  /** Fork source session ID (null for original sessions) */
  forkedFrom: string | null;
  /** Branch ID at the fork point */
  forkBranchId: string | null;
  /** Timestamp when this session was forked */
  forkedAt: number | null;

  // === Agent mode state ===
  /** Current agent mode (build/ask/plan) */
  agentMode: "build" | "ask" | "plan";
  /** Active tool names for current mode */
  activeTools: string[];

  // === UI state ===
  /** IDs of expanded messages (thinking blocks) */
  expandedMessages: string[];
  /** IDs of collapsed messages (tool results) */
  collapsedMessages: string[];
}

/**
 * File System Helpers
 *
 * All fs operations are wrapped in safe* variants that swallow errors gracefully.
 * This avoids crashing the agent loop when ~/.config is read-only or a session file is corrupted.
 */

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

function safeReadFile<T>(path: string, parser: (raw: string) => T): T | null {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, "utf-8");
    return parser(raw);
  } catch {
    return null;
  }
}

function safeWriteFile(filePath: string, data: string): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, data, { mode: 0o600 });
  } catch {
    // Silently ignore write errors
  }
}

function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function safeDeleteDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Session Helpers
 *
 * SessionConfig collects the cross-cutting dependencies (auth, registry, settings, tools)
 * needed by every createAgentSession call so create/load/continue can share one code path.
 */

function sessionInfoToMeta(info: SessionInfo): SessionMeta {
  const forkMeta = forkManager.getForkMetadata(info.id);
  return {
    id: info.id,
    title: info.name || info.firstMessage || "Untitled Session",
    filePath: info.path,
    cwd: info.cwd,
    createdAt: info.created,
    updatedAt: info.modified,
    messageCount: info.messageCount,
    // Fork-related fields
    forkedFrom: forkMeta?.sourceSessionId ?? null,
    forkDepth: forkMeta ? forkManager.getForkDepth(info.id) : 0,
    childForks: forkManager.getChildForks(info.id),
  };
}

interface SessionConfig {
  authStorage: ReturnType<typeof getPiAuthStorage>;
  modelRegistry: ReturnType<typeof getPiModelRegistry>;
  settingsManager: ReturnType<typeof getPiSettingsManager>;
  currentModel: ReturnType<typeof getCurrentPiModel>;
  customTools: ReturnType<typeof createCodingToolDefinitions>;
}

function buildSessionConfig(taskManager: SessionTaskManager): SessionConfig {
  return {
    authStorage: getPiAuthStorage(),
    modelRegistry: getPiModelRegistry(),
    settingsManager: getPiSettingsManager(),
    currentModel: getCurrentPiModel(),
    customTools: createCodingToolDefinitions(process.cwd(), taskManager),
  };
}

async function createAgentSessionWithConfig(
  sessionManager: ReturnType<typeof SessionManager.create>,
  config: SessionConfig
): Promise<CreateAgentSessionResult> {
  return createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage: config.authStorage,
    modelRegistry: config.modelRegistry,
    settingsManager: config.settingsManager,
    model: config.currentModel,
    noTools: "builtin",
    customTools: config.customTools,
    sessionManager,
  });
}

/**
 * Public API
 *
 * createNewSession / loadSession / continueRecentSession all share the same boot sequence:
 *   buildSessionConfig → createAgentSessionWithConfig → (optionally save initial state)
 * listSessions converts Pi SessionInfo objects into Koi's SessionMeta shape.
 */

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    // Clear fork manager cache to ensure fresh data
    forkManager.clearCache();
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
  const config = buildSessionConfig(taskManager);
  const sessionManager = SessionManager.create(process.cwd());
  const result = await createAgentSessionWithConfig(sessionManager, config);

  const now = Date.now();
  const state: KoiSessionState = {
    sessionId: result.session.sessionId,
    title: "New Session",
    currentModel: config.currentModel ? { provider: config.currentModel.provider, modelId: config.currentModel.id } : null,
    auxiliaryModel: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
    // Fork-related state (null for new sessions)
    forkedFrom: null,
    forkBranchId: null,
    forkedAt: null,
    // Agent mode state (defaults for new sessions)
    agentMode: "build",
    activeTools: [
      "read",
      "grep",
      "glob",
      "ls",
      "bash",
      "edit",
      "write",
      "webfetch",
      "taskCreate",
      "taskGet",
      "taskList",
      "taskUpdate",
      "askUserQuestion",
      "enterPlanMode",
      "exitPlanMode",
    ],
    // UI state
    expandedMessages: [],
    collapsedMessages: [],
  };
  saveKoiState(result.session.sessionId, state);
  return result;
}

export async function loadSession(
  filePath: string,
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);
  const config = buildSessionConfig(taskManager);
  const sessionManager = SessionManager.open(filePath, undefined, process.cwd());
  return createAgentSessionWithConfig(sessionManager, config);
}

export async function continueRecentSession(
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);
  const config = buildSessionConfig(taskManager);
  const sessionManager = SessionManager.continueRecent(process.cwd());
  return createAgentSessionWithConfig(sessionManager, config);
}

export function saveKoiState(sessionId: string, state: KoiSessionState): void {
  safeWriteFile(getKoiStatePath(sessionId), JSON.stringify(state, null, 2) + "\n");
}

export function loadKoiState(sessionId: string): KoiSessionState | null {
  return safeReadFile(getKoiStatePath(sessionId), (raw) => JSON.parse(raw) as KoiSessionState);
}

export function deleteKoiSessionData(sessionId: string): void {
  safeDeleteDir(getKoiSessionDir(sessionId));
}

export async function deleteSession(meta: SessionMeta): Promise<void> {
  safeDeleteFile(meta.filePath);
  deleteKoiSessionData(meta.id);
}

/**
 * Message Builders
 *
 * extractUserContent / extractAssistantContent normalize Pi's message content unions
 * (string | TextBlock[] | ThinkingBlock[]) into plain strings for the TUI fallback path.
 *
 * buildUIMessagesFromAgentSession is a best-effort reconstruction used when koi-state.json
 * is missing (e.g. the user deleted it or opened the session on a different machine).
 */

function extractUserContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } =>
        typeof c === "object" && c !== null && "type" in c && (c as Record<string, unknown>)["type"] === "text"
      )
      .map((c) => c.text)
      .join("");
  }
  return "";
}

function extractAssistantContent(msg: { content: unknown[] }): { text: string; thinking: string } {
  let text = "";
  let thinking = "";
  for (const block of msg.content) {
    if (typeof block !== "object" || block === null) continue;
    const type = (block as Record<string, unknown>)["type"];
    if (type === "text") {
      text += String((block as Record<string, unknown>)["text"] ?? "");
    } else if (type === "thinking" && "thinking" in block) {
      thinking += String((block as Record<string, unknown>)["thinking"] ?? "");
    }
  }
  return { text, thinking };
}

/**
 * Build UIMessage array from AgentSession.messages as a fallback when
 * koi-state.json is missing. This is a best-effort reconstruction.
 */
export function buildUIMessagesFromAgentSession(session: AgentSession): UIMessage[] {
  const uiMessages: UIMessage[] = [];

  for (const msg of session.messages) {
    if (msg.role === "user") {
      uiMessages.push({
        id: `user-${msg.timestamp}`,
        type: "user",
        content: extractUserContent(msg.content),
      });
    } else if (msg.role === "assistant") {
      const { text, thinking } = extractAssistantContent(msg as { content: unknown[] });
      uiMessages.push({
        id: `agent-${msg.timestamp}`,
        type: "agent",
        content: text,
        thinking: thinking || undefined,
        thinkingCollapsed: true,
      });
    } else if (msg.role === "custom" && (msg as unknown as Record<string, unknown>)["customType"] === "plan") {
      const rawContent = (msg as unknown as Record<string, unknown>)["content"];
      const content = typeof rawContent === "string"
        ? rawContent
        : extractUserContent(rawContent);
      uiMessages.push({
        id: `plan-${msg.timestamp}`,
        type: "plan",
        content,
      });
    }
    // tool_result messages are skipped in fallback reconstruction
  }

  // Ensure only the latest plan message is kept (old plans are replaced by new ones).
  const planIndices: number[] = [];
  for (let i = 0; i < uiMessages.length; i++) {
    if (uiMessages[i]!.type === "plan") {
      planIndices.push(i);
    }
  }
  if (planIndices.length > 1) {
    // Remove all but the last plan message.
    for (let i = planIndices.length - 2; i >= 0; i--) {
      uiMessages.splice(planIndices[i]!, 1);
    }
  }

  return uiMessages;
}
