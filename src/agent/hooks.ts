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
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { UIMessage } from "../tui/components/chat-panel.js";
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
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  toggleCollapse: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  clearMessages: () => void;
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

/* ───────── ID & Type Guards ───────── */

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

/* ───────── Event Handlers ───────── */

interface EventHandlerContext {
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  streamingMsgIdRef: React.MutableRefObject<string | null>;
  pendingToolsRef: React.MutableRefObject<Map<string, string>>;
  setSessionTitleState: React.Dispatch<React.SetStateAction<string>>;
  setSessionTitle: (title: string) => void;
  allExpandedRef: React.MutableRefObject<boolean>;
}

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

function handleAgentStart(ctx: EventHandlerContext) {
  ctx.setIsStreaming(true);
  ctx.setMessages((prev) => [
    ...prev.filter((m) => m.type !== "status"),
    { id: generateId("status"), type: "status", content: "Imagining..." },
  ]);
}

function handleAgentEnd(event: Extract<AgentSessionEvent, { type: "agent_end" }>, ctx: EventHandlerContext) {
  ctx.setIsStreaming(false);
  const pendingMsgId = ctx.streamingMsgIdRef.current;
  if (pendingMsgId && event.messages.length > 0) {
    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    if (lastAssistant) {
      const { text, thinking } = extractTextAndThinking(lastAssistant);
      ctx.setMessages((prev) => removeAgentMessageIfEmpty(prev, pendingMsgId, text, thinking));
    }
  }
  ctx.setMessages((prev) => prev.filter((m) => m.type !== "status"));
  ctx.streamingMsgIdRef.current = null;
  ctx.pendingToolsRef.current.clear();
}

function handleMessageStart(event: Extract<AgentSessionEvent, { type: "message_start" }>, ctx: EventHandlerContext) {
  if (!isAssistantMessage(event.message)) return;
  const msgId = generateId("agent");
  ctx.streamingMsgIdRef.current = msgId;
  ctx.setMessages((prev) => [
    ...prev.filter((m) => m.type !== "status"),
    { id: msgId, type: "agent", content: "", thinkingCollapsed: true },
  ]);
}

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

function handleMessageEnd(event: Extract<AgentSessionEvent, { type: "message_end" }>, ctx: EventHandlerContext) {
  if (!isAssistantMessage(event.message)) return;
  const msgId = ctx.streamingMsgIdRef.current;
  if (msgId) {
    const { text, thinking } = extractTextAndThinking(event.message);
    ctx.setMessages((prev) => removeAgentMessageIfEmpty(prev, msgId, text, thinking));
  }
  ctx.streamingMsgIdRef.current = null;
}

function handleToolExecutionStart(event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>, ctx: EventHandlerContext) {
  const toolMsgId = generateId("tool");
  ctx.pendingToolsRef.current.set(event.toolCallId, toolMsgId);
  ctx.setMessages((prev) =>
    prev.concat({
      id: toolMsgId,
      type: "tool_call",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args as Record<string, unknown>,
      collapsed: !ctx.allExpandedRef.current,
    })
  );
}

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

function handleAutoRetryEnd(_event: Extract<AgentSessionEvent, { type: "auto_retry_end" }>, ctx: EventHandlerContext) {
  ctx.setMessages((prev) => prev.filter((m) => m.type !== "retry"));
}

function handleSessionInfoChanged(event: Extract<AgentSessionEvent, { type: "session_info_changed" }>, ctx: EventHandlerContext) {
  if (event.name) {
    ctx.setSessionTitleState(event.name);
    ctx.setSessionTitle(event.name);
  }
}

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
    default: break;
  }
}

/* ───────── Tree Navigation ───────── */

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

/* ───────── useKoiAgent ───────── */

export function useKoiAgent(): KoiAgentState {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitleState] = useState<string>(getSessionTitle());

  const streamingMsgIdRef = useRef<string | null>(null);
  const pendingToolsRef = useRef<Map<string, string>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentModelRef = useRef<ModelRef | null>(getCurrentModel());
  const auxiliaryModelRef = useRef<ModelRef | null>(getAuxiliaryModel());
  const sessionRef = useRef<AgentSession | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);
  const allExpandedRef = useRef<boolean>(false);

  /* ── Ref Sync ── */
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  /* ── Debounced Save ── */
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

  /* ── Subscribe to Session ── */
  const subscribeToSession = useCallback((s: AgentSession) => {
    const ctx: EventHandlerContext = {
      setMessages,
      setIsStreaming,
      streamingMsgIdRef,
      pendingToolsRef,
      setSessionTitleState,
      setSessionTitle,
      allExpandedRef,
    };
    return s.subscribe((event: AgentSessionEvent) => handleEvent(event, ctx));
  }, []);

  /* ── Restore State ── */
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

  /* ── Setup Session ── */
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

  /* ── Build Koi State ── */
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

  /* ── Initialize ── */
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

  /* ── Cleanup ── */
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

  /* ── Reset Session UI ── */
  const resetSessionUI = useCallback(() => {
    setError(null);
    streamingMsgIdRef.current = null;
    pendingToolsRef.current.clear();
  }, []);

  /* ── Session Actions ── */
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

  /* ── Fork Logic ── */
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

  const abort = useCallback(async () => {
    await session?.abort();
  }, [session]);

  const toggleCollapse = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === id && m.type === "tool_call") return { ...m, collapsed: !m.collapsed };
        if (m.id === id && m.type === "agent" && m.thinking) return { ...m, thinkingCollapsed: !m.thinkingCollapsed };
        return m;
      })
    );
  }, []);

  const updateAllCollapsed = useCallback((collapsed: boolean) => {
    allExpandedRef.current = !collapsed;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type === "tool_call") return { ...m, collapsed };
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

  return {
    session,
    messages,
    isStreaming,
    isReady,
    error,
    prompt,
    abort,
    toggleCollapse,
    expandAll,
    collapseAll,
    clearMessages,
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
