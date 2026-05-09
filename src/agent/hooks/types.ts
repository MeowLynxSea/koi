/**
 * Shared Type Definitions for Hooks
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { UIMessage } from "../../tui/components/chat-panel.js";

/**
 * Context passed to event handlers.
 * Contains React setters and refs to avoid stale closures.
 */
export interface EventHandlerContext {
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
 * Session tree node type derived from AgentSession's sessionManager.
 */
export type SessionManagerType = AgentSession["sessionManager"];
export type SessionTreeNode = ReturnType<SessionManagerType["getTree"]>[number];
