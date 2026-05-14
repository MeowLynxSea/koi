/**
 * Hook System Public API
 */

export {
  executeHooksForEvent,
} from "./engine.js";

export {
  registerPluginHooks,
  unregisterPluginHooks,
  registerSessionHook,
  unregisterSessionHooks,
  getSessionHooks,
  registerCallbackHook,
  unregisterCallbackHooks,
  collectHooksForEvent,
  clearAllHooks,
} from "./registry.js";

export {
  onHookProgress,
  emitHookProgress,
} from "./events.js";

export {
  setHookMessageSink,
  emitHookMessages,
  emitHookSystemMessage,
  emitHookStatusMessage,
} from "./messageSink.js";

export {
  registerPendingAsyncHook,
  completePendingAsyncHook,
  getPendingAsyncHooks,
  checkAsyncRewake,
  cancelAllPendingAsyncHooks,
} from "./asyncRegistry.js";

export type {
  HookEvent,
  HookCommand,
  HookMatcher,
  HooksSettings,
  HookInput,
  HookJSONOutput,
  HookResult,
  AggregatedHookResult,
  PluginHookMatcher,
  RegisteredCallbackHook,
  CommandHook,
  PromptHook,
  AgentHook,
  HttpHook,
  FunctionHook,
} from "./types.js";

export { HOOK_EVENTS } from "./types.js";

// Integration helpers
export { wrapToolWithHooks, wrapToolsWithHooks } from "./integrations/toolHooks.js";
export { interceptUserPrompt } from "./integrations/promptHooks.js";
export { emitSessionStart, emitSessionEnd } from "./integrations/sessionHooks.js";
export { runPermissionRequestHooks, runPermissionDeniedHooks } from "./integrations/permissionHooks.js";
export { emitPreCompact, emitPostCompact } from "./integrations/compactionHooks.js";
export { emitSubagentStart, emitSubagentStop } from "./integrations/subagentHooks.js";
export { emitFileChanged } from "./integrations/fileHooks.js";
export { emitSetup, emitStop, emitStopFailure, emitNotification, emitCwdChanged } from "./integrations/lifecycleHooks.js";
export { emitTaskCreated, emitTaskCompleted } from "./integrations/taskHooks.js";
export { emitConfigChange } from "./integrations/configHooks.js";
export { startFileWatcher, stopFileWatcher, addWatchedDirs } from "./integrations/fileWatcher.js";
