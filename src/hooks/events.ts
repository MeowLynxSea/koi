/**
 * Hook Events
 *
 * UI progress emission for long-running hooks.
 * Provides started, progress, and response events.
 */

export interface HookProgressEvent {
  type: "started" | "progress" | "response" | "error";
  pluginName?: string;
  hookType: string;
  event: string;
  message?: string;
  stdout?: string;
  stderr?: string;
}

type HookEventListener = (event: HookProgressEvent) => void;

const listeners: HookEventListener[] = [];

export function onHookProgress(listener: HookEventListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emitHookProgress(event: HookProgressEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}
