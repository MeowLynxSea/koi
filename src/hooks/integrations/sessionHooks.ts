/**
 * Session Hook Integration
 *
 * Emits SessionStart and SessionEnd events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitSessionStart(sessionId: string, cwd: string): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionStart",
    session_id: sessionId,
    cwd,
  };
  const result = await executeHooksForEvent("SessionStart", hookInput, { sessionId });
  forwardHookResult(result, "SessionStart");
}

export async function emitSessionEnd(sessionId: string): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionEnd",
    session_id: sessionId,
  };
  const result = await executeHooksForEvent("SessionEnd", hookInput, { sessionId });
  forwardHookResult(result, "SessionEnd");
}
