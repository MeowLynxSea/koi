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
import type { AssistantMessage, UserMessage, AgentMessage } from "@mariozechner/pi-ai";
import type { UIMessage } from "../tui/components/chat-panel.js";
import { isToolExpandable, isToolForceExpanded, getToolDefaultCollapsed } from "../tui/components/chat-panel.js";
import type { ModelRef } from "../config/settings.js";
import { setSessionTitle, getSessionTitle, getCurrentModel, getAuxiliaryModel } from "../config/settings.js";
import {
  listSessions,
  createNewSession,
  loadSession,
  continueRecentSession,
  saveKoiState,
  loadKoiState,
  buildUIMessagesFromAgentSession,
  deleteSession as deleteSessionStore,
  type SessionMeta,
  type KoiSessionState,
} from "./session-store.js";
import { globalTaskManager } from "./session-tasks.js";

export interface KoiAgentState {
  session: AgentSession | null;
  messages: UIMessage[];
  isStreaming: boolean;
  isReady: boolean;
  error: string | null;
  sessionTitle: string;
  steeringMessages: readonly string[];
  followUpMessages: readonly string[];
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
        reordered.push(currentMessages[idx]);
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
        reordered.push(currentMessages[idx]);

        // Pull any trailing tool_call / tool_result messages that immediately
        // followed this agent message in the old UI order so they stay together.
        for (let i = idx + 1; i < currentMessages.length; i++) {
          if (usedIndices.has(i)) break;
          const m = currentMessages[i];
          if (m.type === "tool_call" || m.type === "tool_result") {
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
    }
  }

  // Append any unmatched current messages (tool_call, tool_result, etc.)
  for (let i = 0; i < currentMessages.length; i++) {
    if (!usedIndices.has(i)) {
      reordered.push(currentMessages[i]);
    }
  }

  return reordered;
}

/** Fired when the LLM begins generating a response. Shows a status indicator. */
function handleAgentStart(ctx: EventHandlerContext) {
  ctx.setIsStreaming(true);
  ctx.setMessages((prev) => [
    ...prev.filter((m) => m.type !== "status"),
    { id: generateId("status"), type: "status", content: "Imagining..." },
  ]);
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
    let next = prev.filter((m) => m.type !== "status");

    // Check whether Pi's session history already contains user messages
    // that are not yet in our UI (e.g. queued/followUp messages delivered
    // by Pi before agent_end fired). If so, rebuild from event.messages
    // to get the correct order instead of blindly appending to the end.
    const historyUserTexts = event.messages
      .filter(isUserMessage)
      .map(getUserMessageContent);
    const uiUserTexts = new Set(next.filter((m) => m.type === "user").map((m) => m.content));
    const hasNewUserMessages = historyUserTexts.some((text) => !uiUserTexts.has(text));

    if (hasNewUserMessages && event.messages.length > 0) {
      // Finalise the pending streaming placeholder first
      if (pendingMsgId) {
        const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
        if (lastAssistant) {
          const { text, thinking } = extractTextAndThinking(lastAssistant);
          next = removeAgentMessageIfEmpty(next, pendingMsgId, text, thinking);
        }
      }
      return rebuildMessagesFromHistory(next, event.messages, pendingMsgId);
    }

    // Fallback: old append logic for cases where Pi hasn't yet added
    // the queued messages to its history snapshot.
    if (pendingMsgId && event.messages.length > 0) {
      const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
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

  // Keep refs in sync with latest state for cleanup handlers (unmount, switch, delete).
  // These refs avoid stale closures without adding every state to dependency arrays.
  useEffect(() => { sessionRef.current = session; }, [session]);
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
    };
    return s.subscribe((event: AgentSessionEvent) => handleEvent(event, ctx));
  }, []);

  // On session load: prefer persisted koi-state.json; fall back to rebuilding from AgentSession.messages.
  const restoreSessionState = useCallback((s: AgentSession) => {
    const koiState = loadKoiState(s.sessionId);
    setMessages(koiState?.messages.length ? koiState.messages : buildUIMessagesFromAgentSession(s));

    const title = koiState?.title ?? s.sessionName;
    if (title) {
      setSessionTitleState(title);
      setSessionTitle(title);
    }
    if (koiState?.currentModel) currentModelRef.current = koiState.currentModel;
    if (koiState?.auxiliaryModel) auxiliaryModelRef.current = koiState.auxiliaryModel;
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
    }),
    []
  );

  // On mount: try to continue the most recent session; on failure surface the error and show the UI anyway.
  useEffect(() => {
    let mounted = true;
    void continueRecentSession(globalTaskManager)
      .then((result) => {
        if (!mounted) {
          result.session.dispose();
          return;
        }
        void setupSession(result);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
        setIsReady(true);
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
  }, []);

  // -- Session Actions --
  const switchSession = useCallback(
    async (sessionFile: string) => {
      if (!session) return;
      setIsReady(false);
      saveCurrentState();
      await session.abort();
      session.dispose();
      try {
        const result = await loadSession(sessionFile, globalTaskManager);
        resetSessionUI();
        await setupSession(result);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setIsReady(true);
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

    if (nextUserIndex >= 1) {
      return forwardPath[nextUserIndex - 1]?.id ?? entryId;
    }
    if (nextUserIndex === -1) {
      return forwardPath[forwardPath.length - 1]?.id ?? entryId;
    }
    return entryId;
  }, []);

  const forkSession = useCallback(
    async (entryId: string) => {
      if (!session) return;
      const forwardPath = computeForwardPath(session, entryId);
      const branchFromId = findBranchPoint(forwardPath, entryId);

      session.sessionManager.branch(branchFromId);
      const context = session.sessionManager.buildSessionContext();
      session.state.messages = context.messages;
      setMessages(buildUIMessagesFromAgentSession(session));
      streamingMsgIdRef.current = null;
      pendingToolsRef.current.clear();
      saveCurrentState();
    },
    [session, computeForwardPath, findBranchPoint, saveCurrentState]
  );

  // Persist the title to both React state and the Pi AgentSession so the JSONL file reflects the change.
  const setSessionTitleWrapper = useCallback(
    (title: string) => {
      setSessionTitleState(title);
      setSessionTitle(title);
      session?.setSessionName(title);
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

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;
      setMessages((prev) =>
        prev.concat({ id: generateId("user"), type: "user", content: text })
      );
      await session.prompt(text);
    },
    [session]
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

  return {
    session,
    messages,
    isStreaming,
    isReady,
    error,
    steeringMessages,
    followUpMessages,
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
  };
}
