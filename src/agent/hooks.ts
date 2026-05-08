/**
 * Agent Lifecycle Hooks
 *
 * React hooks that bridge Pi AgentSession events to the TUI state layer.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { createKoiSession } from "./session.js";
import type { UIMessage } from "../tui/components/chat-panel.js";

export interface KoiAgentState {
  session: AgentSession | null;
  messages: UIMessage[];
  isStreaming: boolean;
  isReady: boolean;
  error: string | null;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  toggleCollapse: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  clearMessages: () => void;
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
      thinking += block.thinking;
    }
  }
  return { text, thinking };
}

function handleEvent(
  event: AgentSessionEvent,
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  streamingMsgIdRef: React.MutableRefObject<string | null>,
  pendingToolsRef: React.MutableRefObject<Map<string, string>>
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
      // Recover any unfinalized streaming message from agent_end.messages
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
                next[idx] = {
                  ...(next[idx] as UIMessage & { type: "agent" }),
                  content: text,
                  thinking: thinking.length > 0 ? thinking : undefined,
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
      const msgId = generateId("agent");
      streamingMsgIdRef.current = msgId;
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "status"),
        { id: msgId, type: "agent", content: "" },
      ]);
      break;
    }

    case "message_update": {
      const msgId = streamingMsgIdRef.current;
      if (!msgId) return;
      const assistantMsg = event.message as AssistantMessage;
      const { text, thinking } = extractTextAndThinking(assistantMsg);

      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (m) => m.id === msgId && m.type === "agent"
        );
        if (idx >= 0) {
          next[idx] = {
            ...(next[idx] as UIMessage & { type: "agent" }),
            content: text,
            thinking: thinking.length > 0 ? thinking : undefined,
          };
        }
        return next;
      });
      break;
    }

    case "message_end": {
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
              next[idx] = {
                ...(next[idx] as UIMessage & { type: "agent" }),
                content: text,
                thinking: thinking.length > 0 ? thinking : undefined,
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

    case "session_info_changed":
    case "thinking_level_changed":
    case "queue_update":
    case "turn_start":
    case "turn_end": {
      break;
    }
  }
}

export function useKoiAgent(): KoiAgentState {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamingMsgIdRef = useRef<string | null>(null);
  const pendingToolsRef = useRef<Map<string, string>>(new Map());

  // Initialize session on mount
  useEffect(() => {
    let mounted = true;

    createKoiSession()
      .then(({ session: s }) => {
        if (!mounted) {
          s.dispose();
          return;
        }
        setSession(s);
        setIsReady(true);

        s.subscribe((event: AgentSessionEvent) => {
          handleEvent(
            event,
            setMessages,
            setIsStreaming,
            streamingMsgIdRef,
            pendingToolsRef
          );
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message ?? String(err));
        setIsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (session) {
        session.dispose();
      }
    };
  }, [session]);

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
  };
}
