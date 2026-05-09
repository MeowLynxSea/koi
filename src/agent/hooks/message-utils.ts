/**
 * Message Utilities
 *
 * Pure utility functions for message extraction, transformation, and reconstruction.
 * These functions are designed to be tree-shakable and independently testable.
 */

import type { AssistantMessage, UserMessage } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { UIMessage } from "../../tui/components/chat-panel.js";

// ============================================================================
// Types
// ============================================================================

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export interface CustomPlanMessage {
  role: "custom";
  customType: "plan";
  content: string | unknown[];
  display: boolean;
  timestamp: number;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a collision-resistant ID for UI message keys within a single session.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as Record<string, unknown>)["role"] === "assistant"
  );
}

export function isUserMessage(msg: unknown): msg is UserMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as Record<string, unknown>)["role"] === "user"
  );
}

export function isThinkingBlock(block: { type: string }): block is ThinkingBlock {
  return block.type === "thinking" && "thinking" in block;
}

export function isCustomPlanMessage(msg: unknown): msg is CustomPlanMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "role" in msg &&
    (msg as unknown as Record<string, unknown>)["role"] === "custom" &&
    "customType" in msg &&
    (msg as unknown as Record<string, unknown>)["customType"] === "plan"
  );
}

// ============================================================================
// Content Extraction
// ============================================================================

export function getUserMessageContent(msg: UserMessage): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function extractCustomPlanContent(msg: { content: string | unknown[] }): string {
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

export function extractTextAndThinking(msg: AssistantMessage): {
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

// ============================================================================
// Message State Transformation
// ============================================================================

/**
 * Computes the next agent message state during a streaming message_update event.
 * Tracks thinking start/end timestamps so the UI can show a "Thinking..." spinner
 * and collapse/expand the reasoning block after generation finishes.
 */
export function buildAgentMessageUpdate(
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

export function updateAgentMessage(
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

export function removeAgentMessageIfEmpty(
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

// ============================================================================
// Message Reconstruction
// ============================================================================

/**
 * Rebuilds the UI message list from Pi's session history (`event.messages`),
 * preserving existing UI state (thinkingCollapsed, expanded, etc.) for matched messages.
 * Unmatched messages from the current UI (e.g. tool_call, tool_result) are appended at the end.
 */
export function rebuildMessagesFromHistory(
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
