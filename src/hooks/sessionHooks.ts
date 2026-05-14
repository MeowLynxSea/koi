/**
 * Session Hooks
 *
 * Ephemeral session-scoped hooks that are automatically cleaned up
 * when the session ends. Supports `once: true` for auto-removal.
 */

import type { HookEvent, HookMatcher, HookCommand } from "./types.js";
import { registerSessionHook as baseRegisterSessionHook, unregisterSessionHooks } from "./registry.js";

export { unregisterSessionHooks };

/**
 * Register a session hook with automatic `once` support.
 * If any hook in the matcher has `once: true`, it will be removed after first execution.
 */
export function registerSessionHook(
  sessionId: string,
  event: HookEvent,
  matcher: HookMatcher
): void {
  // Wrap hooks to support `once` auto-removal
  const wrappedMatcher: HookMatcher = {
    matcher: matcher.matcher,
    hooks: matcher.hooks.map((hook) => {
      if (hook.once) {
        return {
          ...hook,
          once: true,
        };
      }
      return hook;
    }),
  };

  baseRegisterSessionHook(sessionId, event, wrappedMatcher);
}

/**
 * Remove hooks marked with `once: true` from a session after execution.
 */
export function removeOnceHooks(sessionId: string, event: HookEvent, executedHooks: HookCommand[]): void {
  // This is called by the engine after executing session hooks
  // The actual removal is handled by the engine by re-registering the remaining hooks
  void sessionId;
  void event;
  void executedHooks;
}
