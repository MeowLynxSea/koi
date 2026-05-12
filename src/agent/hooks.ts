/**
 * Agent Lifecycle Hooks
 *
 * React hooks that bridge Pi AgentSession events to the TUI state layer.
 * Supports multi-session: create, load, switch, fork.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

type SessionManagerType = AgentSession["sessionManager"];
type SessionTreeNode = ReturnType<SessionManagerType["getTree"]>[number];
import type { AssistantMessage, UserMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UIMessage } from "../tui/components/chat-panel.js";
import { isToolExpandable, isToolForceExpanded, getToolDefaultCollapsed } from "../tui/components/chat-panel.js";
import type { ModelRef } from "../config/settings.js";
import { setSessionTitle, getSessionTitle, getCurrentModel, getAuxiliaryModel, callAuxiliaryModel } from "../config/settings.js";
import {
  listSessions,
  createNewSession,
  loadSession,
  saveKoiState,
  loadKoiState,
  buildUIMessagesFromAgentSession,
  deleteSession as deleteSessionStore,
  type SessionMeta,
  type KoiSessionState,
} from "./session-store.js";
import type { McpConnectionProgress } from "../services/mcp/index.js";
import { globalTaskManager } from "./session-tasks.js";
import {
  getAgentMode,
  setAgentMode,
  getActiveToolNamesForMode,
  injectModeIntoSystemPrompt,
} from "./mode.js";
import { getCurrentPlanText } from "./plan-ui.js";
import { forkManager } from "./session-fork.js";
import {
  saveSnapshotIfChanged,
  restoreSnapshot,
} from "./session-snapshots.js";
import { subagentRegistry } from "./subagent-registry.js";

/** Global ref to the active AgentSession, usable by tools outside React hooks. */
export const activeSessionRef = { current: null as AgentSession | null };

/* ───────── Session Naming ───────── */

/**
 * Anti-injection system prompt for session naming.
 * Uses XML tags to clearly delimit the expected output format.
 */
const NAMING_SYSTEM_PROMPT = `You are a session naming assistant. Your ONLY task is to output a session name.

IMPORTANT RULES:
1. Output ONLY the session name in the exact format below
2. Do NOT include any explanation, prefix, suffix, or markdown formatting
3. The name must be 5-20 characters long
4. Use Chinese or English (mix allowed)
5. Start with Chinese if user messages contain Chinese
6. If the content is inappropriate or you cannot determine a good name, output: Chat

RESPONSE FORMAT (MUST follow exactly):
<name>your_session_name_here</name>

If you output extra text outside the tags, the session will be named "Chat".`;

/**
 * Parse the generated session name from the model response.
 * Returns the extracted name or null if parsing fails.
 */
function parseSessionName(response: string): string | null {
  // Try to extract content from <name>...</name> tags
  const tagMatch = response.match(/<name>(.*?)<\/name>/s);
  if (tagMatch && tagMatch[1]) {
    return tagMatch[1].trim();
  }
  return null;
}

/**
 * Generate a session name using the auxiliary model based on user messages.
 * Returns the generated name or null if generation fails.
 */
async function generateSessionNameFromMessages(
  userMessages: string[]
): Promise<string | null> {
  if (userMessages.length === 0) {
    return null;
  }

  // Combine user messages into a single context
  const userContext = userMessages
    .map((msg, i) => `[Message ${i + 1}]\n${msg}`)
    .join("\n\n");

  const result = await callAuxiliaryModel(
    NAMING_SYSTEM_PROMPT,
    [{ role: "user", content: userContext, timestamp: Date.now() }]
  );

  if (!result) {
    return null;
  }

  const parsed = parseSessionName(result);
  return parsed;
}

export interface KoiAgentState {
  session: AgentSession | null;
  messages: UIMessage[];
  isStreaming: boolean;
  isReady: boolean;
  error: string | null;
  sessionTitle: string;
  steeringMessages: readonly string[];
  followUpMessages: readonly string[];
  // MCP connection progress state
  isConnectingMcp: boolean;
  mcpConnectionProgress: McpConnectionProgress | null;
  prompt: (text: string) => Promise<void>;
  steer: (text: string) => Promise<void>;
  followUp: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  toggleCollapse: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  clearMessages: () => void;
  removePendingMessage: (type: "sheer" | "queued", index: number) => string | null;
  retractMessage: (id: string) => string | null;
  switchSession: (sessionFile: string) => Promise<void>;
  newSession: () => Promise<void>;
  forkSession: (entryId: string) => Promise<void>;
  setSessionTitle: (title: string) => void;
  sessionList: SessionMeta[];
  refreshSessionList: () => Promise<void>;
  currentSessionId: string | null;
  saveCurrentState: () => void;
  deleteSession: (sessionId: string) => Promise<void>;
  addPlanMessage: (content: string) => Promise<void>;
  /** Sync agent mode changes to session state (called when mode changes externally) */
  syncAgentMode: (mode: "build" | "ask" | "plan") => void;
}

/**
 * ID & Type Guards
 *
 * generateId: collision-resistant enough for UI message keys within a single session.
 * isAssistantMessage / isThinkingBlock: narrow union types from the generic AgentMessage content blocks.
 */

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as Record<string, unknown>)["role"] === "assistant"
  );
}

function isUserMessage(msg: unknown): msg is UserMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as Record<string, unknown>)["role"] === "user"
  );
}

function getUserMessageContent(msg: UserMessage): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

function isThinkingBlock(block: { type: string }): block is ThinkingBlock {
  return block.type === "thinking" && "thinking" in block;
}

function isCustomPlanMessage(msg: unknown): msg is { role: "custom"; customType: "plan"; content: string | unknown[]; display: boolean; timestamp: number } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as unknown as Record<string, unknown>)["role"] === "custom" &&
    "customType" in msg &&
    (msg as unknown as Record<string, unknown>)["customType"] === "plan"
  );
}

function extractCustomPlanContent(msg: { content: string | unknown[] }): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c): c is { type: "text"; text: string } =>
        typeof c === "object" && c !== null && "type" in c && (c as unknown as Record<string, unknown>)["type"] === "text"
      )
      .map((c) => c.text)
      .join("");
  }
  return "";
}

function extractTextAndThinking(msg: AssistantMessage): {
  text: string;
  thinking: string;
} {
  let text = "";
  let thinking = "";
  for (const block of msg.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (isThinkingBlock(block)) {
      thinking += block.thinking || "";
    }
  }
  return { text, thinking };
}

/**
 * Event Handlers
 *
 * Each Pi AgentSession event is mapped to a dedicated handler below.
 * Handlers receive an EventHandlerContext (setters + refs) so they stay pure-ish and testable.
 * The handleEvent() switch at the bottom of this section dispatches by event type.
 */

interface EventHandlerContext {
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  streamingMsgIdRef: React.MutableRefObject<string | null>;
  pendingToolsRef: React.MutableRefObject<Map<string, string>>;
  setSessionTitleState: React.Dispatch<React.SetStateAction<string>>;
  setSessionTitle: (title: string) => void;
  allExpandedRef: React.MutableRefObject<boolean>;
  setSteeringMessages: React.Dispatch<React.SetStateAction<readonly string[]>>;
  setFollowUpMessages: React.Dispatch<React.SetStateAction<readonly string[]>>;
  localSteerQueueRef: React.MutableRefObject<string[]>;
  localFollowUpQueueRef: React.MutableRefObject<string[]>;
  hasToolCallsRef: React.MutableRefObject<boolean>;
  sessionRef: React.MutableRefObject<AgentSession | null>;
}

/**
 * Computes the next agent message state during a streaming message_update event.
 * Tracks thinking start/end timestamps so the UI can show a "Thinking..." spinner
 * and collapse/expand the reasoning block after generation finishes.
 */
function buildAgentMessageUpdate(
  prevMsg: UIMessage & { type: "agent" },
  text: string,
  thinking: string,
  assistantEvent?: { type: string }
): UIMessage {
  const thinkingStarted = thinking.length > 0 && !prevMsg.thinkingStartTime;
  const thinkingJustEnded =
    prevMsg.thinkingStartTime &&
    !prevMsg.thinkingEndTime &&
    (assistantEvent?.type === "thinking_end" ||
      assistantEvent?.type === "text_start" ||
      assistantEvent?.type === "text_delta" ||
      assistantEvent?.type === "toolcall_start" ||
      assistantEvent?.type === "toolcall_delta");

  return {
    ...prevMsg,
    content: text,
    thinking: thinking.length > 0 ? thinking : undefined,
    thinkingStartTime: thinkingStarted ? Date.now() : prevMsg.thinkingStartTime,
    thinkingEndTime: thinkingJustEnded ? Date.now() : prevMsg.thinkingEndTime,
  };
}

function updateAgentMessage(
  messages: UIMessage[],
  msgId: string,
  updater: (msg: UIMessage & { type: "agent" }) => UIMessage
): UIMessage[] {
  const next = [...messages];
  const idx = next.findIndex((m) => m.id === msgId && m.type === "agent");
  if (idx >= 0) {
    next[idx] = updater(next[idx] as UIMessage & { type: "agent" });
  }
  return next;
}

function removeAgentMessageIfEmpty(
  messages: UIMessage[],
  msgId: string,
  text: string,
  thinking: string
): UIMessage[] {
  const next = [...messages];
  const idx = next.findIndex((m) => m.id === msgId && m.type === "agent");
  if (idx >= 0) {
    if (text.length === 0 && thinking.length === 0) {
      next.splice(idx, 1);
    } else {
      const prevMsg = next[idx] as UIMessage & { type: "agent" };
      next[idx] = {
        ...prevMsg,
        content: text,
        thinking: thinking.length > 0 ? thinking : undefined,
        thinkingEndTime:
          thinking.length > 0 && !prevMsg.thinkingEndTime
            ? Date.now()
            : prevMsg.thinkingEndTime,
      };
    }
  }
  return next;
}

/**
 * Rebuilds the UI message list from Pi's session history (`event.messages`),
 * preserving existing UI state (thinkingCollapsed, expanded, etc.) for matched messages.
 * Unmatched messages from the current UI (e.g. tool_call, tool_result) are appended at the end.
 */
export function isInternalNotification(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("<task-notification>") || t.startsWith("<monitor-notification>");
}

function rebuildMessagesFromHistory(
  currentMessages: UIMessage[],
  historyMessages: AgentMessage[],
  pendingMsgId?: string | null
): UIMessage[] {
  const reordered: UIMessage[] = [];
  const usedIndices = new Set<number>();

  for (const histMsg of historyMessages) {
    if (isUserMessage(histMsg)) {
      const content = getUserMessageContent(histMsg);
      const idx = currentMessages.findIndex(
        (m, i) => !usedIndices.has(i) && m.type === "user" && m.content === content
      );
      if (idx >= 0) {
        usedIndices.add(idx);
        reordered.push(currentMessages[idx]!);
      } else {
        reordered.push({ id: generateId("user"), type: "user", content });
      }
    } else if (isAssistantMessage(histMsg)) {
      const { text, thinking } = extractTextAndThinking(histMsg);

      // If the pending streaming agent message ended up empty, skip it
      // so we don't resurrect a removed placeholder.
      const pendingIdx = currentMessages.findIndex(
        (m, i) => !usedIndices.has(i) && m.type === "agent" && m.id === pendingMsgId
      );
      const isEmptyPending = pendingIdx >= 0 && text.length === 0 && thinking.length === 0;
      if (isEmptyPending) {
        usedIndices.add(pendingIdx);
        continue;
      }

      const idx = currentMessages.findIndex(
        (m, i) => !usedIndices.has(i) && m.type === "agent" && m.content === text
      );
      if (idx >= 0) {
        usedIndices.add(idx);
        reordered.push(currentMessages[idx]!);

        // Pull any trailing tool_call / tool_result messages that immediately
        // followed this agent message in the old UI order so they stay together.
        for (let i = idx + 1; i < currentMessages.length; i++) {
          if (usedIndices.has(i)) break;
          const m = currentMessages[i];
          if (!m) break;
          if (m.type === "tool_call") {
            usedIndices.add(i);
            reordered.push(m);
          } else {
            break;
          }
        }
      } else {
        reordered.push({
          id: generateId("agent"),
          type: "agent",
          content: text,
          thinking: thinking || undefined,
          thinkingCollapsed: true,
        });
      }
    } else if (isCustomPlanMessage(histMsg)) {
      const content = extractCustomPlanContent(histMsg);
      const idx = currentMessages.findIndex(
        (m, i) => !usedIndices.has(i) && m.type === "plan"
      );
      if (idx >= 0) {
        usedIndices.add(idx);
        reordered.push(currentMessages[idx]!);
      } else {
        reordered.push({
          id: generateId("plan"),
          type: "plan",
          content,
        });
      }
    }
  }

  // Append any unmatched current messages (tool_call, etc.)
  for (let i = 0; i < currentMessages.length; i++) {
    if (!usedIndices.has(i)) {
      reordered.push(currentMessages[i]!);
    }
  }

  // Deduplicate plan messages: only the latest plan is kept.
  const planIndices: number[] = [];
  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i]!.type === "plan") {
      planIndices.push(i);
    }
  }
  if (planIndices.length > 1) {
    for (let i = planIndices.length - 2; i >= 0; i--) {
      reordered.splice(planIndices[i]!, 1);
    }
  }

  return reordered;
}

/** Fired when the LLM begins generating a response. */
function handleAgentStart(ctx: EventHandlerContext) {
  ctx.setIsStreaming(true);
}

/**
 * Fired when the LLM finishes a full turn.
 * Replaces the streaming placeholder with the final assistant text (or removes it if empty).
 * Also inserts any pending followUp messages and remaining steer messages at turn end.
 */
function handleAgentEnd(event: Extract<AgentSessionEvent, { type: "agent_end" }>, ctx: EventHandlerContext) {
  ctx.setIsStreaming(false);

  // Deliver any remaining steer messages (turn had no tool calls) and all followUp messages
  const steerToInsert = ctx.localSteerQueueRef.current;
  ctx.localSteerQueueRef.current = [];
  const followUpToInsert = ctx.localFollowUpQueueRef.current;
  ctx.localFollowUpQueueRef.current = [];

  const pendingMsgId = ctx.streamingMsgIdRef.current;

  ctx.setMessages((prev) => {
    let next: UIMessage[] = prev.filter((m) => m.type !== "status");

    // AgentSessionEvent.agent_end.messages only contains messages from the
    // CURRENT run (newMessages), not the full session history. We must use
    // sessionRef.current.messages for any history-reconstruction logic.
    const fullHistory = ctx.sessionRef.current?.messages ?? event.messages;

    // Check whether Pi's session history already contains user messages
    // that are not yet in our UI (e.g. queued/followUp messages delivered
    // by Pi before agent_end fired). If so, rebuild from full history
    // to get the correct order instead of blindly appending to the end.
    const historyUserTexts = fullHistory
      .filter(isUserMessage)
      .map(getUserMessageContent);
    const uiUserTexts = new Set(next.filter((m) => m.type === "user").map((m) => m.content));
    const hasNewUserMessages = historyUserTexts.some((text) => !uiUserTexts.has(text));

    if (hasNewUserMessages && fullHistory.length > 0) {
      // Finalise the pending streaming placeholder first
      if (pendingMsgId) {
        const lastAssistant = [...fullHistory].reverse().find(isAssistantMessage);
        if (lastAssistant) {
          const { text, thinking } = extractTextAndThinking(lastAssistant);
          next = removeAgentMessageIfEmpty(next, pendingMsgId, text, thinking);
        }
      }
      return rebuildMessagesFromHistory(next, fullHistory, pendingMsgId);
    }

    // Fallback: old append logic for cases where Pi hasn't yet added
    // the queued messages to its history snapshot.
    if (pendingMsgId && fullHistory.length > 0) {
      const lastAssistant = [...fullHistory].reverse().find(isAssistantMessage);
      if (lastAssistant) {
        const { text, thinking } = extractTextAndThinking(lastAssistant);
        next = removeAgentMessageIfEmpty(next, pendingMsgId, text, thinking);
      }
    }

    const inserts = [
      ...steerToInsert.map((text) => ({ id: generateId("user"), type: "user" as const, content: text })),
      ...followUpToInsert.map((text) => ({ id: generateId("user"), type: "user" as const, content: text })),
    ];
    if (inserts.length > 0) {
      return next.concat(inserts);
    }
    return next;
  });

  ctx.streamingMsgIdRef.current = null;
  ctx.pendingToolsRef.current.clear();
  ctx.hasToolCallsRef.current = false;

  // Save snapshot after each completed turn so forks can restore exact state.
  const currentSession = ctx.sessionRef.current;
  if (currentSession) {
    saveSnapshotIfChanged(currentSession, {
      tasks: globalTaskManager.listTasks(),
      planText: getCurrentPlanText(),
      agentMode: getAgentMode(),
      activeTools: getActiveToolNamesForMode(getAgentMode()),
    });
  }

  // ─── CCE: Post-turn associative processing ───
  // Feed the agent's own response back into CCE so discoveries, insights,
  // and references made by the agent enter Working Memory and the associative network.
  void (async () => {
    try {
      const fullHistory = ctx.sessionRef.current?.messages ?? event.messages;
      const lastAssistant = [...fullHistory].reverse().find(isAssistantMessage);
      if (lastAssistant) {
        const { text } = extractTextAndThinking(lastAssistant);
        if (text && text.trim().length > 0) {
          const { getCceSystem } = await import("../cce/index.js");
          const cce = getCceSystem();
          if (cce) {
            await cce.injector.processAgentResponse(text);
          }
        }
      }
    } catch {
      // ignore CCE post-turn errors
    }
  })();
}

/** Creates a blank streaming placeholder for the incoming assistant message.
 *  If there were tool calls in this turn, any pending steer messages are delivered
 *  right before the new assistant message (after tools finish, before next LLM call).
 */
function handleMessageStart(event: Extract<AgentSessionEvent, { type: "message_start" }>, ctx: EventHandlerContext) {
  if (!isAssistantMessage(event.message)) return;
  const steerToInsert = ctx.hasToolCallsRef.current ? ctx.localSteerQueueRef.current : [];
  if (ctx.hasToolCallsRef.current) {
    ctx.localSteerQueueRef.current = [];
  }
  const msgId = generateId("agent");
  ctx.streamingMsgIdRef.current = msgId;
  ctx.setMessages((prev) => [
    ...prev.filter((m) => m.type !== "status"),
    ...(steerToInsert.length > 0
      ? steerToInsert.map((text) => ({ id: generateId("user"), type: "user" as const, content: text }))
      : []),
    { id: msgId, type: "agent", content: "", thinkingCollapsed: true },
  ]);
}

/**
 * Fired on every token / block delta during streaming.
 * Updates content, thinking text, and thinking start/end timestamps in a single immutable swap.
 */
function handleMessageUpdate(event: Extract<AgentSessionEvent, { type: "message_update" }>, ctx: EventHandlerContext) {
  if (!isAssistantMessage(event.message)) return;
  const msgId = ctx.streamingMsgIdRef.current;
  if (!msgId) return;
  const { text, thinking } = extractTextAndThinking(event.message);
  const assistantEvent = event.assistantMessageEvent;
  ctx.setMessages((prev) =>
    updateAgentMessage(prev, msgId, (prevMsg) =>
      buildAgentMessageUpdate(prevMsg, text, thinking, assistantEvent)
    )
  );
}

/**
 * Finalizes the streaming message. Unlike agent_end, this fires per-message
 * (a turn may contain multiple messages when tools are involved).
 */
function handleMessageEnd(event: Extract<AgentSessionEvent, { type: "message_end" }>, ctx: EventHandlerContext) {
  if (!isAssistantMessage(event.message)) return;
  const msgId = ctx.streamingMsgIdRef.current;
  if (msgId) {
    const { text, thinking } = extractTextAndThinking(event.message);
    ctx.setMessages((prev) => removeAgentMessageIfEmpty(prev, msgId, text, thinking));
  }
  ctx.streamingMsgIdRef.current = null;
}

/** Adds a pending tool_call message to the UI so the user sees live execution. */
function handleToolExecutionStart(event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>, ctx: EventHandlerContext) {
  ctx.hasToolCallsRef.current = true;
  const toolMsgId = generateId("tool");
  ctx.pendingToolsRef.current.set(event.toolCallId, toolMsgId);
  ctx.setMessages((prev) =>
    prev.concat({
      id: toolMsgId,
      type: "tool_call",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args as Record<string, unknown>,
      collapsed: getToolDefaultCollapsed(event.toolName, ctx.allExpandedRef.current),
    })
  );
}

/** Streams partial tool results (e.g. long-running bash output chunks). */
function handleToolExecutionUpdate(event: Extract<AgentSessionEvent, { type: "tool_execution_update" }>, ctx: EventHandlerContext) {
  const toolMsgId = ctx.pendingToolsRef.current.get(event.toolCallId);
  if (!toolMsgId) return;
  ctx.setMessages((prev) =>
    prev.map((m) =>
      m.id === toolMsgId && m.type === "tool_call"
        ? { ...m, result: event.partialResult }
        : m
    )
  );
}

/** Marks the tool call as complete and stores the final result (or error). */
function handleToolExecutionEnd(event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>, ctx: EventHandlerContext) {
  const toolMsgId = ctx.pendingToolsRef.current.get(event.toolCallId);
  if (!toolMsgId) return;
  ctx.setMessages((prev) =>
    prev.map((m) =>
      m.id === toolMsgId && m.type === "tool_call"
        ? { ...m, result: event.result, isError: event.isError }
        : m
    )
  );
}

/** Notifies the user that the session is being compacted to reduce context usage. */
function handleCompactionStart(event: Extract<AgentSessionEvent, { type: "compaction_start" }>, ctx: EventHandlerContext) {
  ctx.setMessages((prev) =>
    prev.concat({
      id: generateId("compact"),
      type: "compaction",
      content: `Compacting session (${event.reason})...`,
    })
  );
}

function handleCompactionEnd(event: Extract<AgentSessionEvent, { type: "compaction_end" }>, ctx: EventHandlerContext) {
  ctx.setMessages((prev) =>
    prev.map((m) =>
      m.type === "compaction" && m.content.includes("Compacting")
        ? {
            ...m,
            content: event.aborted ? "Compaction aborted." : "Session compacted.",
          }
        : m
    )
  );

  // Re-apply mode-specific tool restrictions and system prompt after compaction,
  // in case the compaction process reset any session state.
  const session = ctx.sessionRef.current;
  if (session && !event.aborted) {
    const mode = getAgentMode();
    session.setActiveToolsByName(getActiveToolNamesForMode(mode));
    injectModeIntoSystemPrompt(session, mode);
  }
}

/** Shows a retry banner when the agent encounters a transient error and retries automatically. */
function handleAutoRetryStart(event: Extract<AgentSessionEvent, { type: "auto_retry_start" }>, ctx: EventHandlerContext) {
  ctx.setMessages((prev) =>
    prev
      .filter((m) => m.type !== "status")
      .concat({
        id: generateId("retry"),
        type: "retry",
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        content: `Retrying... (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
      })
  );
}

/** Clears the retry banner once the retry cycle finishes (success or final failure). */
function handleAutoRetryEnd(_event: Extract<AgentSessionEvent, { type: "auto_retry_end" }>, ctx: EventHandlerContext) {
  ctx.setMessages((prev) => prev.filter((m) => m.type !== "retry"));
}

/** Syncs the session name when the agent or user renames it. */
function handleSessionInfoChanged(event: Extract<AgentSessionEvent, { type: "session_info_changed" }>, ctx: EventHandlerContext) {
  if (event.name) {
    ctx.setSessionTitleState(event.name);
    ctx.setSessionTitle(event.name);
  }
}

/** Syncs the pending steer/followUp queues from the agent session to React state.
 *  Delivery detection is handled manually via local queues and event boundaries
 *  (steer after tool calls, followUp at agent_end), so this only updates the UI state.
 */
function handleQueueUpdate(event: Extract<AgentSessionEvent, { type: "queue_update" }>, ctx: EventHandlerContext) {
  ctx.setSteeringMessages(event.steering);
  ctx.setFollowUpMessages(event.followUp);
}

/**
 * Central dispatcher for all AgentSession events.
 * Uses a switch so TypeScript can narrow the event type for each handler.
 */
function handleEvent(event: AgentSessionEvent, ctx: EventHandlerContext) {
  switch (event.type) {
    case "agent_start": handleAgentStart(ctx); break;
    case "agent_end": handleAgentEnd(event, ctx); break;
    case "message_start": handleMessageStart(event, ctx); break;
    case "message_update": handleMessageUpdate(event, ctx); break;
    case "message_end": handleMessageEnd(event, ctx); break;
    case "tool_execution_start": handleToolExecutionStart(event, ctx); break;
    case "tool_execution_update": handleToolExecutionUpdate(event, ctx); break;
    case "tool_execution_end": handleToolExecutionEnd(event, ctx); break;
    case "compaction_start": handleCompactionStart(event, ctx); break;
    case "compaction_end": handleCompactionEnd(event, ctx); break;
    case "auto_retry_start": handleAutoRetryStart(event, ctx); break;
    case "auto_retry_end": handleAutoRetryEnd(event, ctx); break;
    case "session_info_changed": handleSessionInfoChanged(event, ctx); break;
    case "queue_update": handleQueueUpdate(event, ctx); break;
    default: break;
  }
}

/**
 * Tree Navigation
 *
 * Session entries form a tree because of forking / branching.
 * findNodeInTree walks the entire tree to locate an entry by its id.
 */

function findNodeInTree(
  nodes: SessionTreeNode[],
  id: string
): SessionTreeNode | null {
  for (const node of nodes) {
    if (node.entry.id === id) return node;
    const found = findNodeInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * useKoiAgent — Core React hook for the Koi TUI.
 *
 * Bridges Pi's AgentSession lifecycle to React state:
 *   • Event subscription & message streaming
 *   • Session CRUD (create, switch, fork, delete)
 *   • Auto-save of UI state to ~/.config/koi/sessions/<id>/koi-state.json
 *   • Collapse / expand helpers for tool_calls and thinking blocks
 *
 * Refs are kept in sync with state so cleanup handlers (unmount, switch, delete)
 * always see the latest values without adding them to dependency arrays.
 */

export function useKoiAgent(): KoiAgentState {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitleState] = useState<string>(getSessionTitle());
  const [steeringMessages, setSteeringMessages] = useState<readonly string[]>([]);
  const [followUpMessages, setFollowUpMessages] = useState<readonly string[]>([]);
  // MCP connection progress state
  const [isConnectingMcp, setIsConnectingMcp] = useState(false);
  const [mcpConnectionProgress, setMcpConnectionProgress] = useState<McpConnectionProgress | null>(null);

  const streamingMsgIdRef = useRef<string | null>(null);
  const pendingToolsRef = useRef<Map<string, string>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentModelRef = useRef<ModelRef | null>(getCurrentModel());
  const auxiliaryModelRef = useRef<ModelRef | null>(getAuxiliaryModel());
  const sessionRef = useRef<AgentSession | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);
  const allExpandedRef = useRef<boolean>(false);
  const localSteerQueueRef = useRef<string[]>([]);
  const localFollowUpQueueRef = useRef<string[]>([]);
  const hasToolCallsRef = useRef(false);
  // Track whether this session has been named by the auxiliary model
  const sessionNamedRef = useRef(false);

  // Refs for session state that needs to be persisted with KoiSessionState
  const sessionStateRef = useRef<{
    forkedFrom: string | null;
    forkBranchId: string | null;
    forkedAt: number | null;
    agentMode: "build" | "ask" | "plan";
    activeTools: string[];
  }>({
    forkedFrom: null,
    forkBranchId: null,
    forkedAt: null,
    agentMode: "build",
    activeTools: getActiveToolNamesForMode("build"),
  });

  // Keep refs in sync with latest state for cleanup handlers (unmount, switch, delete).
  // These refs avoid stale closures without adding every state to dependency arrays.
  useEffect(() => { 
    sessionRef.current = session;
    activeSessionRef.current = session;
  }, [session]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // Debounce writes to disk: avoids hammering the filesystem on every token during streaming.
  // Also batches rapid message updates into a single save.
  const scheduleSave = useCallback(
    (sessionId: string, msgs: UIMessage[], title: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const state: KoiSessionState = {
          sessionId,
          title,
          currentModel: currentModelRef.current,
          auxiliaryModel: auxiliaryModelRef.current,
          messages: msgs,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          // Fork and agent mode state
          forkedFrom: sessionStateRef.current.forkedFrom,
          forkBranchId: sessionStateRef.current.forkBranchId,
          forkedAt: sessionStateRef.current.forkedAt,
          agentMode: sessionStateRef.current.agentMode,
          activeTools: sessionStateRef.current.activeTools,
          // UI state (empty, will be populated by actual UI interactions)
          expandedMessages: [],
          collapsedMessages: [],
          // Subagent state (empty, will be restored on session load)
          subagents: [],
        };
        saveKoiState(sessionId, state);
        globalTaskManager.save(sessionId);
      }, 500);
    },
    []
  );

  useEffect(() => {
    if (currentSessionId && session) {
      scheduleSave(currentSessionId, messages, session.sessionName || getSessionTitle());
    }
  }, [messages, currentSessionId, session, scheduleSave]);

  // Wire Pi AgentSession events into React setters via the central handleEvent dispatcher.
  const subscribeToSession = useCallback((s: AgentSession) => {
    // Set refs immediately so event handlers (which may fire before the next
    // React render cycle / useEffect) see the correct session.
    sessionRef.current = s;
    activeSessionRef.current = s;
    const ctx: EventHandlerContext = {
      setMessages,
      setIsStreaming,
      streamingMsgIdRef,
      pendingToolsRef,
      setSessionTitleState,
      setSessionTitle,
      allExpandedRef,
      setSteeringMessages,
      setFollowUpMessages,
      localSteerQueueRef,
      localFollowUpQueueRef,
      hasToolCallsRef,
      sessionRef,
    };
    return s.subscribe((event: AgentSessionEvent) => handleEvent(event, ctx));
  }, []);

  // On session load: prefer persisted koi-state.json; fall back to rebuilding from AgentSession.messages.
  const restoreSessionState = useCallback((s: AgentSession) => {
    const koiState = loadKoiState(s.sessionId);
    let restoredMessages = koiState?.messages.length ? koiState.messages : buildUIMessagesFromAgentSession(s);

    // Strip internal subagent notifications from restored messages — they are
    // meant for the LLM context only and should not clutter the UI.
    restoredMessages = restoredMessages.filter(
      (m) => !(m.type === "user" && isInternalNotification(m.content))
    );

    // Deduplicate plan messages: only the latest plan is kept.
    const planIndices: number[] = [];
    for (let i = 0; i < restoredMessages.length; i++) {
      if (restoredMessages[i]!.type === "plan") {
        planIndices.push(i);
      }
    }
    if (planIndices.length > 1) {
      const filtered = restoredMessages.filter((_, i) => !planIndices.slice(0, -1).includes(i));
      restoredMessages = filtered;
    }

    setMessages(restoredMessages);

    const title = koiState?.title ?? s.sessionName;
    if (title) {
      setSessionTitleState(title);
      setSessionTitle(title);
    }
    if (koiState?.currentModel) currentModelRef.current = koiState.currentModel;
    if (koiState?.auxiliaryModel) auxiliaryModelRef.current = koiState.auxiliaryModel;

    // Restore fork-related and agent mode state
    if (koiState) {
      sessionStateRef.current = {
        forkedFrom: koiState.forkedFrom ?? null,
        forkBranchId: koiState.forkBranchId ?? null,
        forkedAt: koiState.forkedAt ?? null,
        agentMode: koiState.agentMode ?? "build",
        activeTools: koiState.activeTools ?? getActiveToolNamesForMode(koiState.agentMode ?? "build"),
      };

      // Restore agent mode for the session
      setAgentMode(sessionStateRef.current.agentMode);
      s.setActiveToolsByName(sessionStateRef.current.activeTools);
      injectModeIntoSystemPrompt(s, sessionStateRef.current.agentMode);
    }

    // Restore snapshot (tasks + plan + mode) for current leaf, overriding koiState if present.
    const leafId = s.sessionManager.getLeafId();
    if (leafId) {
      const snapshotData = restoreSnapshot(s, leafId, globalTaskManager);
      if (snapshotData) {
        sessionStateRef.current = {
          ...sessionStateRef.current,
          agentMode: snapshotData.agentMode,
          activeTools: snapshotData.activeTools,
        };
        setAgentMode(snapshotData.agentMode);
        s.setActiveToolsByName(snapshotData.activeTools);
        injectModeIntoSystemPrompt(s, snapshotData.agentMode);
      }
    }
  }, []);

  // Orchestrates the full session boot sequence (subscribe → restore state → refresh list).
  const setupSession = useCallback(
    async (result: { session: AgentSession }) => {
      const s = result.session;
      setSession(s);
      setCurrentSessionId(s.sessionId);
      globalTaskManager.setActiveSession(s.sessionId);
      subscribeToSession(s);
      restoreSessionState(s);
      // Restore subagent state for this session
      subagentRegistry.restoreFromSession(s.sessionId);
      setIsReady(true);
      setSessionList(await listSessions());
    },
    [subscribeToSession, restoreSessionState]
  );

  // Shared state shape used by saveCurrentState, scheduleSave, and the unmount cleanup effect.
  const buildKoiState = useCallback(
    (sid: string, msgs: UIMessage[], title: string): KoiSessionState => ({
      sessionId: sid,
      title,
      currentModel: currentModelRef.current,
      auxiliaryModel: auxiliaryModelRef.current,
      messages: msgs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Fork and agent mode state
      forkedFrom: sessionStateRef.current.forkedFrom,
      forkBranchId: sessionStateRef.current.forkBranchId,
      forkedAt: sessionStateRef.current.forkedAt,
      agentMode: sessionStateRef.current.agentMode,
      activeTools: sessionStateRef.current.activeTools,
      // UI state
      expandedMessages: [],
      collapsedMessages: [],
      // Subagent state (empty, will be restored on session load)
      subagents: [],
    }),
    []
  );

  // On mount: create a new session instead of continuing the most recent one.
  useEffect(() => {
    let mounted = true;
    
    // Start MCP connection progress tracking
    setIsConnectingMcp(true);
    setMcpConnectionProgress({
      total: 0,
      completed: 0,
      currentServer: "Initializing...",
      status: "connecting",
    });
    
    void createNewSession(globalTaskManager, (progress) => {
      if (mounted) {
        setMcpConnectionProgress(progress);
      }
    })
      .then((result) => {
        if (!mounted) {
          result.session.dispose();
          return;
        }
        // Clear MCP connection progress
        setIsConnectingMcp(false);
        setMcpConnectionProgress(null);
        void setupSession(result);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
        setIsReady(true);
        setIsConnectingMcp(false);
        setMcpConnectionProgress(null);
      });
    return () => { mounted = false; };
  }, [setupSession]);

  // On unmount: persist final state before disposing the AgentSession to prevent data loss.
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      const sid = currentSessionIdRef.current;
      const msgs = messagesRef.current;
      if (s) {
        if (sid) {
          saveKoiState(sid, buildKoiState(sid, msgs, s.sessionName || getSessionTitle()));
          globalTaskManager.save(sid);
        }
        s.dispose();
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [buildKoiState]);

  const saveCurrentState = useCallback(() => {
    if (currentSessionId && session) {
      saveKoiState(currentSessionId, buildKoiState(currentSessionId, messages, session.sessionName || getSessionTitle()));
      globalTaskManager.save(currentSessionId);
    }
  }, [currentSessionId, session, messages, buildKoiState]);

  // Clears streaming artifacts (msg id, pending tools) when switching or creating a new session.
  const resetSessionUI = useCallback(() => {
    setError(null);
    streamingMsgIdRef.current = null;
    pendingToolsRef.current.clear();
    setSteeringMessages([]);
    setFollowUpMessages([]);
    localSteerQueueRef.current = [];
    localFollowUpQueueRef.current = [];
    hasToolCallsRef.current = false;
    sessionNamedRef.current = false;
  }, []);

  // -- Session Actions --
  const switchSession = useCallback(
    async (sessionFile: string) => {
      if (!session) return;
      setIsReady(false);
      saveCurrentState();
      await session.abort();
      session.dispose();
      
      // Start MCP connection progress tracking
      setIsConnectingMcp(true);
      setMcpConnectionProgress({
        total: 0,
        completed: 0,
        currentServer: "Initializing...",
        status: "connecting",
      });
      
      try {
        const result = await loadSession(sessionFile, globalTaskManager, (progress) => {
          setMcpConnectionProgress(progress);
        });
        
        // Clear MCP connection progress
        setIsConnectingMcp(false);
        setMcpConnectionProgress(null);
        
        resetSessionUI();
        await setupSession(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setIsReady(true);
        setIsConnectingMcp(false);
        setMcpConnectionProgress(null);
      }
    },
    [session, saveCurrentState, setupSession, resetSessionUI]
  );

  const newSession = useCallback(async () => {
    if (!session) return;
    setIsReady(false);
    saveCurrentState();
    await session.abort();
    session.dispose();
    
    // Start MCP connection progress tracking
    setIsConnectingMcp(true);
    setMcpConnectionProgress({
      total: 0,
      completed: 0,
      currentServer: "Initializing...",
      status: "connecting",
    });
    
    try {
      const result = await createNewSession(globalTaskManager, (progress) => {
        setMcpConnectionProgress(progress);
      });
      
      // Clear MCP connection progress
      setIsConnectingMcp(false);
      setMcpConnectionProgress(null);
      
      resetSessionUI();
      setMessages([]);
      setSessionTitleState("New Session");
      setSessionTitle("New Session");
      currentModelRef.current = getCurrentModel();
      auxiliaryModelRef.current = getAuxiliaryModel();
      await setupSession(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsReady(true);
      setIsConnectingMcp(false);
      setMcpConnectionProgress(null);
    }
  }, [session, saveCurrentState, setupSession, resetSessionUI]);

/**
   * Fork Logic
   *
   * Forking creates a new branch in the conversation tree.
   * computeForwardPath builds the path from the selected entry to the leaf.
   * findBranchPoint walks forward to locate the next user message; we branch
   * from the entry *before* it so the entire assistant/tool turn is preserved.
   */
  const computeForwardPath = useCallback(
    (session: AgentSession, entryId: string) => {
      const branchPath = session.sessionManager.getBranch();
      const selectedIndex = branchPath.findIndex((e) => e.id === entryId);

      if (selectedIndex >= 0) {
        return branchPath.slice(selectedIndex);
      }

      const tree = session.sessionManager.getTree();
      const selectedNode = findNodeInTree(tree, entryId);
      if (!selectedNode) return [];

      const path = [selectedNode.entry];
      let current = selectedNode;
      while (current.children.length > 0) {
        const next = current.children[current.children.length - 1];
        if (!next) break;
        current = next;
        path.push(current.entry);
      }
      return path;
    },
    []
  );

  const findBranchPoint = useCallback((forwardPath: ReturnType<SessionManagerType["getBranch"]>, entryId: string) => {
    if (forwardPath.length === 0) return entryId;

    let nextUserIndex = -1;
    for (let i = 1; i < forwardPath.length; i++) {
      const entry = forwardPath[i];
      if (entry?.type === "message" && entry.message.role === "user") {
        nextUserIndex = i;
        break;
      }
    }

    // Walk backward from the candidate to skip custom entries (snapshots, plans)
    // so we never branch from a synthetic node.
    const findLastNonCustom = (startIndex: number): string | undefined => {
      for (let i = startIndex; i >= 0; i--) {
        const entry = forwardPath[i];
        if (entry && entry.type !== "custom") {
          return entry.id;
        }
      }
      return undefined;
    };

    if (nextUserIndex >= 1) {
      return findLastNonCustom(nextUserIndex - 1) ?? entryId;
    }
    if (nextUserIndex === -1) {
      return findLastNonCustom(forwardPath.length - 1) ?? entryId;
    }
    return entryId;
  }, []);

  const forkSession = useCallback(
    async (entryId: string) => {
      if (!session) return;

      // 1. Calculate branch point
      const forwardPath = computeForwardPath(session, entryId);
      const branchFromId = findBranchPoint(forwardPath, entryId);
      const branchPath = session.sessionManager.getBranch();

      // 2. Execute session branching
      session.sessionManager.branch(branchFromId);
      const context = session.sessionManager.buildSessionContext();
      session.state.messages = context.messages;

      // 3. Restore snapshot at the fork point (tasks + plan)
      const snapshotData = restoreSnapshot(session, entryId, globalTaskManager);

      // 4. Determine restored or fallback state for metadata
      const restoredAgentMode = snapshotData?.agentMode ?? getAgentMode();
      const restoredActiveTools = snapshotData?.activeTools ?? getActiveToolNamesForMode(restoredAgentMode);
      const restoredPlan = snapshotData?.planText ?? getCurrentPlanText();
      const restoredTasks = globalTaskManager.listTasks();
      const currentKoiState = loadKoiState(session.sessionId);

      // 5. Create and save fork metadata
      const forkMetadata = {
        forkId: session.sessionId,
        sourceSessionId: session.sessionId,
        sourceBranchId: branchPath.find(e => e.id === branchFromId)?.id ?? '',
        forkPoint: branchFromId,
        forkedAt: Date.now(),
        tasksSnapshot: restoredTasks,
        agentMode: restoredAgentMode,
        activeTools: restoredActiveTools,
        pendingPlanText: restoredPlan,
      };
      forkManager.saveForkMetadata(session.sessionId, forkMetadata);

      // 6. Update KoiSessionState with fork-related info
      const now = Date.now();
      const forkedState: KoiSessionState = {
        ...(currentKoiState ?? {
          sessionId: session.sessionId,
          title: session.sessionName || "Forked Session",
          currentModel: getCurrentModel(),
          auxiliaryModel: getAuxiliaryModel(),
          messages: [],
          createdAt: now,
          updatedAt: now,
        }),
        forkedFrom: session.sessionId,
        forkBranchId: branchFromId,
        forkedAt: now,
        agentMode: restoredAgentMode,
        activeTools: restoredActiveTools,
        expandedMessages: [],
        collapsedMessages: [],
        subagents: [],
      };
      saveKoiState(session.sessionId, forkedState);

      // Update sessionStateRef for future saves
      sessionStateRef.current = {
        forkedFrom: session.sessionId,
        forkBranchId: branchFromId,
        forkedAt: Date.now(),
        agentMode: restoredAgentMode,
        activeTools: restoredActiveTools,
      };

      // 7. Rebuild UI messages from the new branch context
      setMessages(buildUIMessagesFromAgentSession(session));

      // 8. Restore agent mode state for the new branch
      setAgentMode(restoredAgentMode);
      session.setActiveToolsByName(restoredActiveTools);
      injectModeIntoSystemPrompt(session, restoredAgentMode);

      // 9. Clear streaming state
      streamingMsgIdRef.current = null;
      pendingToolsRef.current.clear();

      // 10. Save all state
      saveCurrentState();
      globalTaskManager.saveActive();
    },
    [session, computeForwardPath, findBranchPoint, saveCurrentState]
  );

  // Persist the title to both React state and the Pi AgentSession so the JSONL file reflects the change.
  // Also save to koiState immediately so the title persists across sessions.
  const setSessionTitleWrapper = useCallback(
    (title: string) => {
      setSessionTitleState(title);
      setSessionTitle(title);
      session?.setSessionName(title);
      // Immediately persist the title change to koiState
      const sid = currentSessionIdRef.current;
      if (sid) {
        const koiState = loadKoiState(sid);
        if (koiState) {
          saveKoiState(sid, {
            ...koiState,
            title,
            updatedAt: Date.now(),
          });
        }
      }
    },
    [session]
  );

  const refreshSessionList = useCallback(async () => {
    setSessionList(await listSessions());
  }, []);

  // Deleting the active session disposes it and immediately creates a new blank session
  // so the UI never enters a "dead" state with no session available.
  const deleteSession = useCallback(
    async (sessionId: string) => {
      const isCurrent = sessionId === currentSessionId;
      const meta = sessionList.find((s) => s.id === sessionId);
      if (!meta) return;

      if (isCurrent && session) {
        saveCurrentState();
        await session.abort();
        session.dispose();
        await deleteSessionStore(meta);
        try {
          const result = await createNewSession(globalTaskManager);
          resetSessionUI();
          setMessages([]);
          setSessionTitleState("New Session");
          setSessionTitle("New Session");
          currentModelRef.current = getCurrentModel();
          auxiliaryModelRef.current = getAuxiliaryModel();
          await setupSession(result);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : String(err));
          setIsReady(true);
        }
      } else {
        await deleteSessionStore(meta);
        setSessionList((prev) => prev.filter((s) => s.id !== sessionId));
      }
    },
    [session, currentSessionId, sessionList, saveCurrentState, setupSession, resetSessionUI]
  );

  // Internal function to trigger session naming (called after user prompt)
  const triggerSessionNaming = useCallback(
    async (allMessages: UIMessage[]) => {
      // Only name if:
      // 1. Session hasn't been named yet
      // 2. Current title is the default "New Session"
      // 3. There are user messages to base the name on
      if (sessionNamedRef.current) return;
      if (sessionTitle !== "New Session") return;

      const userMessages = allMessages
        .filter((m) => m.type === "user")
        .map((m) => m.content);

      if (userMessages.length === 0) return;

      const name = await generateSessionNameFromMessages(userMessages);
      if (name) {
        sessionNamedRef.current = true;
        // Update all: Pi AgentSession, React state, and settings file
        // Use setSessionTitleWrapper to also persist the title to koiState
        setSessionTitleWrapper(name);
      }
    },
    [sessionTitle, session, setSessionTitleWrapper] // intentional: omit sessionTitle to avoid re-running
  );

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;

      // ─── CCE: Auto process utterance + inject context ───
      try {
        const { getCceSystem } = await import("../cce/index.js");
        const cce = getCceSystem();
        if (cce) {
          const result = await cce.injector.buildInjection(text);
          if (result.injection) {
            // Append CCE context as a system message for this turn only
            // Pi's AgentSession may support temporary context injection
            // Fallback: prepend to the user message
            text = `${text}\n\n${result.injection}`;
          }
        }
      } catch {
        // CCE not initialized or error — continue normally
      }

      setMessages((prev) => {
        const updated = prev.concat({ id: generateId("user"), type: "user", content: text });
        // Trigger naming asynchronously after state update
        void triggerSessionNaming(updated);
        return updated;
      });
      await session.prompt(text);
    },
    [session, triggerSessionNaming]
  );

  const steer = useCallback(
    async (text: string) => {
      if (!session) return;
      localSteerQueueRef.current.push(text);
      await session.steer(text);
    },
    [session]
  );

  const followUp = useCallback(
    async (text: string) => {
      if (!session) return;
      localFollowUpQueueRef.current.push(text);
      await session.followUp(text);
    },
    [session]
  );

  const abort = useCallback(async () => {
    await session?.abort();
  }, [session]);

  // Per-message collapse toggle: tool_calls collapse their full output;
  // agent messages collapse their thinking block (if present).
  const toggleCollapse = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === id && m.type === "tool_call") {
          if (!isToolExpandable(m.toolName)) return m;
          return { ...m, collapsed: !m.collapsed };
        }
        if (m.id === id && m.type === "agent" && m.thinking) return { ...m, thinkingCollapsed: !m.thinkingCollapsed };
        return m;
      })
    );
  }, []);

  // Global expand/collapse: updates every collapsible message at once.
  // Also sets allExpandedRef so *new* tool calls inherit the current preference.
  const updateAllCollapsed = useCallback((collapsed: boolean) => {
    allExpandedRef.current = !collapsed;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type === "tool_call") {
          if (!isToolExpandable(m.toolName) || isToolForceExpanded(m.toolName)) return m;
          return { ...m, collapsed };
        }
        if (m.type === "agent" && m.thinking) return { ...m, thinkingCollapsed: collapsed };
        return m;
      })
    );
  }, []);

  const expandAll = useCallback(() => updateAllCollapsed(false), [updateAllCollapsed]);
  const collapseAll = useCallback(() => updateAllCollapsed(true), [updateAllCollapsed]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    streamingMsgIdRef.current = null;
    pendingToolsRef.current.clear();
  }, []);

  const removePendingMessage = useCallback(
    (type: "sheer" | "queued", index: number) => {
      if (!session) return null;
      const cleared = session.clearQueue();
      const newSteering = [...cleared.steering];
      const newFollowUp = [...cleared.followUp];

      let removedText: string | null = null;
      if (type === "sheer") {
        removedText = newSteering.splice(index, 1)[0] ?? null;
        localSteerQueueRef.current.splice(index, 1);
      } else {
        removedText = newFollowUp.splice(index, 1)[0] ?? null;
        localFollowUpQueueRef.current.splice(index, 1);
      }

      // Re-add remaining messages to Pi's queue
      for (const text of newSteering) {
        void session.steer(text);
      }
      for (const text of newFollowUp) {
        void session.followUp(text);
      }

      return removedText;
    },
    [session]
  );

  const retractMessage = useCallback((id: string) => {
    let retractedText: string | null = null;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id && m.type === "user");
      if (idx < 0) return prev;
      const msg = prev[idx];
      if (msg && msg.type === "user") {
        retractedText = msg.content;
      }
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    return retractedText;
  }, []);

  const addPlanMessage = useCallback(
    async (content: string) => {
      if (!session) return;
      // Remove any existing plan custom messages from the session so the new plan replaces the old one.
      const filtered = session.state.messages.filter((m) => !isCustomPlanMessage(m));
      if (filtered.length !== session.state.messages.length) {
        session.state.messages = filtered;
      }
      await session.sendCustomMessage(
        { customType: "plan", content, display: true },
        { triggerTurn: false }
      );
      // Update React state: replace any existing plan UI messages with the new one.
      setMessages((prev) => {
        const withoutOldPlan = prev.filter((m) => m.type !== "plan");
        return [...withoutOldPlan, { id: generateId("plan"), type: "plan", content }] as UIMessage[];
      });
      // Save snapshot since plan state changed.
      saveSnapshotIfChanged(session, {
        tasks: globalTaskManager.listTasks(),
        planText: content,
        agentMode: getAgentMode(),
        activeTools: getActiveToolNamesForMode(getAgentMode()),
      });
    },
    [session]
  );

  // Sync agent mode changes to sessionStateRef for persistence
  const syncAgentMode = useCallback(
    (mode: "build" | "ask" | "plan") => {
      sessionStateRef.current = {
        ...sessionStateRef.current,
        agentMode: mode,
        activeTools: getActiveToolNamesForMode(mode),
      };
      if (session) {
        session.setActiveToolsByName(sessionStateRef.current.activeTools);
        injectModeIntoSystemPrompt(session, mode);
      }
    },
    [session]
  );

  return {
    session,
    messages,
    isStreaming,
    isReady,
    error,
    steeringMessages,
    followUpMessages,
    isConnectingMcp,
    mcpConnectionProgress,
    prompt,
    steer,
    followUp,
    abort,
    toggleCollapse,
    expandAll,
    collapseAll,
    clearMessages,
    removePendingMessage,
    retractMessage,
    switchSession,
    newSession,
    forkSession,
    sessionList,
    refreshSessionList,
    currentSessionId,
    saveCurrentState,
    sessionTitle,
    setSessionTitle: setSessionTitleWrapper,
    deleteSession,
    addPlanMessage,
    syncAgentMode,
  };
}
