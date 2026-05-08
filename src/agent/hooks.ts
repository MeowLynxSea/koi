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

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as any).role === "assistant"
  );
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
    } else if (block.type === "thinking") {
      thinking += (block as any).thinking || "";
    }
  }
  return { text, thinking };
}

function handleEvent(
  event: AgentSessionEvent,
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  streamingMsgIdRef: React.MutableRefObject<string | null>,
  pendingToolsRef: React.MutableRefObject<Map<string, string>>,
  setSessionTitleState: React.Dispatch<React.SetStateAction<string>>,
  setSessionTitle: (title: string) => void
) {
  switch (event.type) {
    case "agent_start": {
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "status"),
        { id: generateId("status"), type: "status", content: "Imagining..." },
      ]);
      break;
    }

    case "agent_end": {
      setIsStreaming(false);
      const pendingMsgId = streamingMsgIdRef.current;
      if (pendingMsgId && event.messages.length > 0) {
        const lastAssistant = [...event.messages]
          .reverse()
          .find(isAssistantMessage);
        if (lastAssistant) {
          const { text, thinking } = extractTextAndThinking(lastAssistant);
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (m) => m.id === pendingMsgId && m.type === "agent"
            );
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
          });
        }
      }
      setMessages((prev) => prev.filter((m) => m.type !== "status"));
      streamingMsgIdRef.current = null;
      pendingToolsRef.current.clear();
      break;
    }

    case "message_start": {
      if (!isAssistantMessage(event.message)) break;
      const msgId = generateId("agent");
      streamingMsgIdRef.current = msgId;
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "status"),
        { id: msgId, type: "agent", content: "", thinkingCollapsed: true },
      ]);
      break;
    }

    case "message_update": {
      if (!isAssistantMessage(event.message)) break;
      const msgId = streamingMsgIdRef.current;
      if (!msgId) return;
      const assistantMsg = event.message as AssistantMessage;
      const { text, thinking } = extractTextAndThinking(assistantMsg);
      const assistantEvent = (event as any).assistantMessageEvent;

      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (m) => m.id === msgId && m.type === "agent"
        );
        if (idx >= 0) {
          const prevMsg = next[idx] as UIMessage & { type: "agent" };
          const thinkingStarted =
            thinking.length > 0 && !prevMsg.thinkingStartTime;
          const thinkingJustEnded =
            prevMsg.thinkingStartTime &&
            !prevMsg.thinkingEndTime &&
            (assistantEvent?.type === "thinking_end" ||
              assistantEvent?.type === "text_start" ||
              assistantEvent?.type === "text_delta" ||
              assistantEvent?.type === "toolcall_start" ||
              assistantEvent?.type === "toolcall_delta");
          next[idx] = {
            ...prevMsg,
            content: text,
            thinking: thinking.length > 0 ? thinking : undefined,
            thinkingStartTime: thinkingStarted
              ? Date.now()
              : prevMsg.thinkingStartTime,
            thinkingEndTime: thinkingJustEnded ? Date.now() : prevMsg.thinkingEndTime,
          };
        }
        return next;
      });
      break;
    }

    case "message_end": {
      if (!isAssistantMessage(event.message)) break;
      const msgId = streamingMsgIdRef.current;
      if (msgId) {
        const assistantMsg = event.message as AssistantMessage;
        const { text, thinking } = extractTextAndThinking(assistantMsg);
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex(
            (m) => m.id === msgId && m.type === "agent"
          );
          if (idx >= 0) {
            if (text.length === 0 && thinking.length === 0) {
              next.splice(idx, 1);
            } else {
              const prevMsg = next[idx] as UIMessage & { type: "agent" };
              next[idx] = {
                ...prevMsg,
                content: text,
                thinking: thinking.length > 0 ? thinking : undefined,
                thinkingEndTime: thinking.length > 0 && !prevMsg.thinkingEndTime
                  ? Date.now()
                  : prevMsg.thinkingEndTime,
              };
            }
          }
          return next;
        });
      }
      streamingMsgIdRef.current = null;
      break;
    }

    case "tool_execution_start": {
      const toolMsgId = generateId("tool");
      pendingToolsRef.current.set(event.toolCallId, toolMsgId);
      setMessages((prev) =>
        prev.concat({
          id: toolMsgId,
          type: "tool_call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          collapsed: true,
        })
      );
      break;
    }

    case "tool_execution_update": {
      const toolMsgId = pendingToolsRef.current.get(event.toolCallId);
      if (!toolMsgId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === toolMsgId && m.type === "tool_call") {
            return { ...m, result: event.partialResult };
          }
          return m;
        })
      );
      break;
    }

    case "tool_execution_end": {
      const toolMsgId = pendingToolsRef.current.get(event.toolCallId);
      if (!toolMsgId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === toolMsgId && m.type === "tool_call") {
            return {
              ...m,
              result: event.result,
              isError: event.isError,
            };
          }
          return m;
        })
      );
      break;
    }

    case "compaction_start": {
      setMessages((prev) =>
        prev.concat({
          id: generateId("compact"),
          type: "compaction",
          content: `Compacting session (${event.reason})...`,
        })
      );
      break;
    }

    case "compaction_end": {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type === "compaction" && m.content.includes("Compacting")) {
            return {
              ...m,
              content: event.aborted
                ? "Compaction aborted."
                : "Session compacted.",
            };
          }
          return m;
        })
      );
      break;
    }

    case "auto_retry_start": {
      setMessages((prev) =>
        prev.filter((m) => m.type !== "status").concat({
          id: generateId("retry"),
          type: "retry",
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          content: `Retrying... (${event.attempt}/${event.maxAttempts}): ${event.errorMessage}`,
        })
      );
      break;
    }

    case "auto_retry_end": {
      setMessages((prev) => prev.filter((m) => m.type !== "retry"));
      break;
    }

    case "session_info_changed": {
      if (event.name) {
        setSessionTitleState(event.name);
        setSessionTitle(event.name);
      }
      break;
    }
    case "thinking_level_changed":
    case "queue_update":
    case "turn_start":
    case "turn_end": {
      break;
    }
  }
}

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

  // Debounced save of koi-state
  const scheduleSave = useCallback(
    (sessionId: string, msgs: UIMessage[], title: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
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

  // Keep refs in sync with latest state for cleanup handlers
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // Auto-save when messages change
  useEffect(() => {
    if (currentSessionId && session) {
      const title = session.sessionName || getSessionTitle();
      scheduleSave(currentSessionId, messages, title);
    }
  }, [messages, currentSessionId, session, scheduleSave]);

  const subscribeToSession = useCallback(
    (s: AgentSession) => {
      const unsubscribe = s.subscribe((event: AgentSessionEvent) => {
        handleEvent(
          event,
          setMessages,
          setIsStreaming,
          streamingMsgIdRef,
          pendingToolsRef,
          setSessionTitleState,
          setSessionTitle
        );
      });
      return unsubscribe;
    },
    []
  );

  const restoreSessionState = useCallback(
    (s: AgentSession) => {
      const koiState = loadKoiState(s.sessionId);
      if (koiState && koiState.messages.length > 0) {
        setMessages(koiState.messages);
      } else {
        const rebuilt = buildUIMessagesFromAgentSession(s);
        setMessages(rebuilt);
      }
      // Restore title if available
      if (koiState?.title) {
        setSessionTitleState(koiState.title);
        setSessionTitle(koiState.title);
      } else if (s.sessionName) {
        setSessionTitleState(s.sessionName);
      }
      if (koiState?.currentModel) {
        currentModelRef.current = koiState.currentModel;
      }
      if (koiState?.auxiliaryModel) {
        auxiliaryModelRef.current = koiState.auxiliaryModel;
      }
    },
    []
  );

  const setupSession = useCallback(
    async (result: { session: AgentSession }) => {
      const s = result.session;
      setSession(s);
      setCurrentSessionId(s.sessionId);
      globalTaskManager.setActiveSession(s.sessionId);
      subscribeToSession(s);
      restoreSessionState(s);
      setIsReady(true);
      // Refresh session list
      const list = await listSessions();
      setSessionList(list);
    },
    [subscribeToSession, restoreSessionState]
  );

  // Initialize session on mount
  useEffect(() => {
    let mounted = true;

    continueRecentSession(globalTaskManager)
      .then((result) => {
        if (!mounted) {
          result.session.dispose();
          return;
        }
        setupSession(result);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message ?? String(err));
        setIsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [setupSession]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      const sid = currentSessionIdRef.current;
      const msgs = messagesRef.current;
      if (s) {
        // Save before dispose
        if (sid) {
          const title = s.sessionName || getSessionTitle();
          const state: KoiSessionState = {
            sessionId: sid,
            title,
            currentModel: currentModelRef.current,
            auxiliaryModel: auxiliaryModelRef.current,
            messages: msgs,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          saveKoiState(sid, state);
          globalTaskManager.save(sid);
        }
        s.dispose();
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const saveCurrentState = useCallback(() => {
    if (currentSessionId && session) {
      const title = session.sessionName || getSessionTitle();
      const state: KoiSessionState = {
        sessionId: currentSessionId,
        title,
        currentModel: currentModelRef.current,
        auxiliaryModel: auxiliaryModelRef.current,
        messages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveKoiState(currentSessionId, state);
      globalTaskManager.save(currentSessionId);
    }
  }, [currentSessionId, session, messages]);

  const switchSession = useCallback(
    async (sessionFile: string) => {
      if (!session) return;
      setIsReady(false);

      // Save current
      saveCurrentState();
      await session.abort();
      session.dispose();

      // Load new
      try {
        const result = await loadSession(sessionFile, globalTaskManager);
        setError(null);
        streamingMsgIdRef.current = null;
        pendingToolsRef.current.clear();
        await setupSession(result);
      } catch (err: any) {
        setError(err?.message ?? String(err));
        setIsReady(true);
      }
    },
    [session, saveCurrentState, setupSession]
  );

  const newSession = useCallback(async () => {
    if (!session) return;
    setIsReady(false);

    // Save current
    saveCurrentState();
    await session.abort();
    session.dispose();

    // Create new
    try {
      const result = await createNewSession(globalTaskManager);
      setError(null);
      setMessages([]);
      streamingMsgIdRef.current = null;
      pendingToolsRef.current.clear();
      setSessionTitleState("New Session");
      setSessionTitle("New Session");
      currentModelRef.current = getCurrentModel();
      auxiliaryModelRef.current = getAuxiliaryModel();
      await setupSession(result);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setIsReady(true);
    }
  }, [session, saveCurrentState, setupSession]);

  const forkSession = useCallback(
    async (entryId: string) => {
      if (!session) return;

      // Get the current active branch path (root -> leaf)
      const branchPath = session.sessionManager.getBranch();
      const selectedIndex = branchPath.findIndex((e) => e.id === entryId);

      // Build the forward path from the selected entry:
      // - If the selected entry is on the current branch, use the branch
      //   path from the selected entry to the leaf.
      // - If the selected entry is NOT on the current branch (e.g. the user
      //   selected a node on a different branch in the tree view), walk down
      //   the selected node's subtree to the deepest leaf.
      let forwardPath: typeof branchPath;
      if (selectedIndex >= 0) {
        forwardPath = branchPath.slice(selectedIndex);
      } else {
        const tree = session.sessionManager.getTree();
        const selectedNode = findNodeInTree(tree, entryId);
        if (selectedNode) {
          forwardPath = [selectedNode.entry];
          let current = selectedNode;
          while (current.children.length > 0) {
            const next = current.children[current.children.length - 1];
            if (!next) break;
            current = next;
            forwardPath.push(current.entry);
          }
        } else {
          forwardPath = [];
        }
      }

      // Determine the actual branch point:
      // Walk forward from the selected entry to find the next user message.
      // Branch from the entry right before that next user message so the
      // entire conversation turn (user + all assistant/tool responses)
      // is preserved. If there is no next user message, branch from the
      // last entry in the forward path to preserve everything to the end.
      let branchFromId = entryId;
      if (forwardPath.length > 0) {
        let nextUserIndex = -1;
        for (let i = 1; i < forwardPath.length; i++) {
          const entry = forwardPath[i];
          if (!entry) continue;
          if (
            entry.type === 'message' &&
            entry.message.role === 'user'
          ) {
            nextUserIndex = i;
            break;
          }
        }

        if (nextUserIndex >= 1) {
          const predecessor = forwardPath[nextUserIndex - 1];
          if (predecessor) {
            branchFromId = predecessor.id;
          }
        } else if (nextUserIndex === -1) {
          // No next user message — branch from the last entry to keep
          // the entire remainder of the path.
          const leaf = forwardPath[forwardPath.length - 1];
          if (leaf) {
            branchFromId = leaf.id;
          }
        }
      }

      // 1. Move the leaf pointer so subsequent appends create
      //    children of the branch point (a new branch).
      session.sessionManager.branch(branchFromId);

      // 2. Sync the agent's in-memory message list with the new branch
      //    so the LLM sees the correct context on the next turn.
      const context = session.sessionManager.buildSessionContext();
      session.state.messages = context.messages;

      // 3. Rebuild UI messages from the new branch context
      const rebuilt = buildUIMessagesFromAgentSession(session);
      setMessages(rebuilt);
      streamingMsgIdRef.current = null;
      pendingToolsRef.current.clear();

      // 4. Save state
      saveCurrentState();
    },
    [session, saveCurrentState]
  );

  const setSessionTitleWrapper = useCallback((title: string) => {
    setSessionTitleState(title);
    setSessionTitle(title);
    if (session) {
      session.setSessionName(title);
    }
  }, [session]);

  const refreshSessionList = useCallback(async () => {
    const list = await listSessions();
    setSessionList(list);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
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
        setError(null);
        setMessages([]);
        streamingMsgIdRef.current = null;
        pendingToolsRef.current.clear();
        setSessionTitleState("New Session");
        setSessionTitle("New Session");
        currentModelRef.current = getCurrentModel();
        auxiliaryModelRef.current = getAuxiliaryModel();
        await setupSession(result);
      } catch (err: any) {
        setError(err?.message ?? String(err));
        setIsReady(true);
      }
    } else {
      await deleteSessionStore(meta);
      setSessionList((prev) => prev.filter((s) => s.id !== sessionId));
    }
  }, [session, currentSessionId, sessionList, saveCurrentState, setupSession]);

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;
      setMessages((prev) =>
        prev.concat({
          id: generateId("user"),
          type: "user",
          content: text,
        })
      );
      await session.prompt(text);
    },
    [session]
  );

  const abort = useCallback(async () => {
    if (!session) return;
    await session.abort();
  }, [session]);

  const toggleCollapse = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === id && m.type === "tool_call") {
          return { ...m, collapsed: !m.collapsed };
        }
        if (m.id === id && m.type === "agent" && m.thinking) {
          return { ...m, thinkingCollapsed: !m.thinkingCollapsed };
        }
        return m;
      })
    );
  }, []);

  const expandAll = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type === "tool_call") {
          return { ...m, collapsed: false };
        }
        if (m.type === "agent" && m.thinking) {
          return { ...m, thinkingCollapsed: false };
        }
        return m;
      })
    );
  }, []);

  const collapseAll = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type === "tool_call") {
          return { ...m, collapsed: true };
        }
        if (m.type === "agent" && m.thinking) {
          return { ...m, thinkingCollapsed: true };
        }
        return m;
      })
    );
  }, []);

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
