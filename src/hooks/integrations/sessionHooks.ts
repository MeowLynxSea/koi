/**
 * Session Hook Integration
 *
 * Emits SessionStart and SessionEnd events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitSessionStart(
  sessionId: string,
  cwd: string,
  source: "startup" | "resume" | "clear" | "compact" = "startup",
): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionStart",
    session_id: sessionId,
    cwd,
    source,
  };
  const result = await executeHooksForEvent("SessionStart", hookInput, { sessionId, matcherFilter: source });
  forwardHookResult(result, "SessionStart");
}

export async function emitSessionEnd(
  sessionId: string,
  reason: "clear" | "logout" | "prompt_input_exit" | "other" = "other",
): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionEnd",
    session_id: sessionId,
    reason,
  };
  const result = await executeHooksForEvent("SessionEnd", hookInput, { sessionId, matcherFilter: reason });
  forwardHookResult(result, "SessionEnd");
}
