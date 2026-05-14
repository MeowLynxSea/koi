/**
 * Hook Registry
 *
 * Global registry that merges hooks from all sources:
 * - Settings hooks (from ~/.config/koi/settings.json)
 * - Plugin hooks (from enabled plugins)
 * - Session hooks (ephemeral, in-memory only)
 * - SDK callback hooks (in-memory TypeScript callbacks)
 */

import type {
  HookEvent,
  HooksSettings,
  HookCommand,
  HookMatcher,
  PluginHookMatcher,
  RegisteredCallbackHook,
} from "./types.js";
import { getSettingsHooks } from "../plugins/settings.js";

// ============================================================================
// State
// ============================================================================

// pluginName -> event -> matchers
const pluginHooks = new Map<string, Map<HookEvent, PluginHookMatcher[]>>();
const sessionHooks = new Map<string, Map<HookEvent, HookMatcher[]>>();
const callbackHooks: RegisteredCallbackHook[] = [];

// ============================================================================
// Plugin Hooks
// ============================================================================

/**
 * Register hooks from a plugin.
 */
export function registerPluginHooks(
  pluginName: string,
  pluginPath: string,
  hooksConfig: HooksSettings
): void {
  const eventMap = new Map<HookEvent, PluginHookMatcher[]>();
  for (const [event, eventMatchers] of Object.entries(hooksConfig)) {
    const matchers: PluginHookMatcher[] = [];
    for (const matcher of eventMatchers || []) {
      matchers.push({
        matcher: matcher.matcher,
        hooks: matcher.hooks as HookCommand[],
        pluginRoot: pluginPath,
        pluginName,
        pluginId: `${pluginName}@local`,
      });
    }
    eventMap.set(event as HookEvent, matchers);
  }
  pluginHooks.set(pluginName, eventMap);
}

/**
 * Unregister all hooks for a plugin.
 */
export function unregisterPluginHooks(pluginName: string): void {
  pluginHooks.delete(pluginName);
}

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Register a session-scoped hook.
 */
export function registerSessionHook(
  sessionId: string,
  event: HookEvent,
  matcher: HookMatcher
): void {
  let sessionMap = sessionHooks.get(sessionId);
  if (!sessionMap) {
    sessionMap = new Map();
    sessionHooks.set(sessionId, sessionMap);
  }
  const existing = sessionMap.get(event) || [];
  existing.push(matcher);
  sessionMap.set(event, existing);
}

/**
 * Unregister all session hooks for a session.
 */
export function unregisterSessionHooks(sessionId: string): void {
  sessionHooks.delete(sessionId);
}

/**
 * Get session hooks for a specific session and event.
 */
export function getSessionHooks(sessionId: string, event: HookEvent): HookMatcher[] {
  return sessionHooks.get(sessionId)?.get(event) || [];
}

// ============================================================================
// Callback Hooks
// ============================================================================

/**
 * Register a callback hook.
 */
export function registerCallbackHook(callback: RegisteredCallbackHook): () => void {
  callbackHooks.push(callback);
  return () => {
    const idx = callbackHooks.findIndex((c) => c.id === callback.id);
    if (idx >= 0) callbackHooks.splice(idx, 1);
  };
}

/**
 * Unregister all callback hooks for a given ID prefix.
 */
export function unregisterCallbackHooks(idPrefix: string): void {
  for (let i = callbackHooks.length - 1; i >= 0; i--) {
    const hook = callbackHooks[i];
    if (hook && hook.id.startsWith(idPrefix)) {
      callbackHooks.splice(i, 1);
    }
  }
}

// ============================================================================
// Collection
// ============================================================================

/**
 * Collect all matching hooks for an event from all sources.
 */
export function collectHooksForEvent(
  event: HookEvent,
  matcherFilter?: string,
  cwd?: string
): {
  settingsMatchers: HookMatcher[];
  pluginMatchers: PluginHookMatcher[];
  sessionMatchers: HookMatcher[];
  callbacks: RegisteredCallbackHook[];
} {
  // Settings hooks (includes project-level .claude/settings.json)
  const settings = getSettingsHooks(cwd);
  const settingsMatchers = ((settings[event] || []) as unknown as HookMatcher[]).filter(
    (m) => !matcherFilter || !m.matcher || m.matcher === matcherFilter
  );

  // Plugin hooks
  const pluginMatchers: PluginHookMatcher[] = [];
  for (const eventMap of pluginHooks.values()) {
    const matchers = eventMap.get(event) || [];
    for (const matcher of matchers) {
      if (!matcherFilter || !matcher.matcher || matcher.matcher === matcherFilter) {
        pluginMatchers.push(matcher);
      }
    }
  }

  // Session hooks
  const sessionMatchers: HookMatcher[] = [];
  for (const sessionMap of sessionHooks.values()) {
    const matchers = sessionMap.get(event) || [];
    sessionMatchers.push(...matchers);
  }

  // Callback hooks
  const callbacks = callbackHooks.filter((c) => c.event === event);

  return { settingsMatchers, pluginMatchers, sessionMatchers, callbacks };
}

/**
 * Clear all registered hooks (useful for testing or full reset).
 */
export function clearAllHooks(): void {
  pluginHooks.clear();
  sessionHooks.clear();
  callbackHooks.length = 0;
}
