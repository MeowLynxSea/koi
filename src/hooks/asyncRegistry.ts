/**
 * Async Hook Registry
 *
 * Tracks background async command hooks.
 * Polls for completion and handles asyncRewake (wake model on exit code 2).
 */

import type { HookJSONOutput } from "./types.js";

interface PendingAsyncHook {
  id: string;
  pluginName: string;
  event: string;
  startTime: number;
  resolve: (value: HookJSONOutput) => void;
  rewake: boolean;
}

const pendingHooks = new Map<string, PendingAsyncHook>();
let nextId = 1;

/**
 * Register a pending async hook.
 */
export function registerPendingAsyncHook(
  pluginName: string,
  event: string,
  rewake: boolean
): { id: string; promise: Promise<HookJSONOutput> } {
  const id = `async-${nextId++}`;
  const promise = new Promise<HookJSONOutput>((resolve) => {
    pendingHooks.set(id, {
      id,
      pluginName,
      event,
      startTime: Date.now(),
      resolve,
      rewake,
    });
  });
  return { id, promise };
}

/**
 * Complete a pending async hook.
 */
export function completePendingAsyncHook(
  id: string,
  output: HookJSONOutput
): void {
  const hook = pendingHooks.get(id);
  if (!hook) return;
  hook.resolve(output);
  pendingHooks.delete(id);
}

/**
 * Get all currently pending async hooks.
 */
export function getPendingAsyncHooks(): PendingAsyncHook[] {
  return Array.from(pendingHooks.values());
}

/**
 * Check if any pending async hooks should trigger a rewake.
 */
export function checkAsyncRewake(): Array<{ pluginName: string; event: string }> {
  const rewakes: Array<{ pluginName: string; event: string }> = [];
  // In a full implementation, this would poll child processes
  // and check their exit codes for asyncRewake.
  return rewakes;
}

/**
 * Cancel all pending async hooks.
 */
export function cancelAllPendingAsyncHooks(): void {
  for (const hook of pendingHooks.values()) {
    hook.resolve({ continue: true });
  }
  pendingHooks.clear();
}
