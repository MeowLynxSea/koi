/**
 * Hook Message Sink
 *
 * Global callback registry that allows hook integrations to inject
 * system/status messages into the current session's UI message history.
 */

import type { AggregatedHookResult } from "./types.js";

export interface HookUIMessage {
  type: "system" | "status";
  content: string;
  collapsed?: boolean;
}

type MessageSink = (messages: HookUIMessage[]) => void;

let messageSink: MessageSink | null = null;
const pendingMessages: HookUIMessage[] = [];

export function setHookMessageSink(sink: MessageSink | null): void {
  messageSink = sink;
  if (sink && pendingMessages.length > 0) {
    sink([...pendingMessages]);
    pendingMessages.length = 0;
  }
}

export function emitHookMessages(messages: HookUIMessage[]): void {
  if (messages.length === 0) return;
  if (messageSink) {
    messageSink(messages);
  } else {
    pendingMessages.push(...messages);
  }
}

/**
 * Helper to emit a single system message from a hook result.
 */
export function emitHookSystemMessage(content: string): void {
  emitHookMessages([{ type: "system", content, collapsed: true }]);
}

/**
 * Helper to emit a single status message from a hook result.
 */
export function emitHookStatusMessage(content: string): void {
  emitHookMessages([{ type: "status", content }]);
}

/**
 * Forward an AggregatedHookResult's systemMessages and errors into the UI.
 * This is the standard pattern for all integration wrappers.
 * All messages are emitted as "system" type so they persist in the message history.
 */
export function forwardHookResult(result: AggregatedHookResult, eventLabel: string): void {
  const messages: HookUIMessage[] = [];
  for (const msg of result.systemMessages) {
    messages.push({ type: "system", content: `[${eventLabel}] ${msg}`, collapsed: true });
  }
  for (const err of result.errors) {
    messages.push({ type: "system", content: `[${eventLabel}] Error: ${err}`, collapsed: true });
  }
  // Always emit a record so users can see that hooks ran even when they produce no output.
  if (messages.length === 0) {
    const outcomeSummary = result.outcomes.length > 0
      ? result.outcomes.join(", ")
      : "no matching hooks";
    messages.push({ type: "system", content: `[${eventLabel}] ${outcomeSummary}`, collapsed: true });
  }
  emitHookMessages(messages);
}
