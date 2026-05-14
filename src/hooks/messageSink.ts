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
}

type MessageSink = (messages: HookUIMessage[]) => void;

let messageSink: MessageSink | null = null;

export function setHookMessageSink(sink: MessageSink | null): void {
  messageSink = sink;
}

export function emitHookMessages(messages: HookUIMessage[]): void {
  if (messages.length === 0) return;
  messageSink?.(messages);
}

/**
 * Helper to emit a single system message from a hook result.
 */
export function emitHookSystemMessage(content: string): void {
  emitHookMessages([{ type: "system", content }]);
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
 */
export function forwardHookResult(result: AggregatedHookResult, eventLabel: string): void {
  const messages: HookUIMessage[] = [];
  for (const msg of result.systemMessages) {
    messages.push({ type: "system", content: `[${eventLabel}] ${msg}` });
  }
  for (const err of result.errors) {
    messages.push({ type: "status", content: `[${eventLabel}] Error: ${err}` });
  }
  emitHookMessages(messages);
}
