/**
 * Session Hook Integration
 *
 * Emits SessionStart and SessionEnd events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

export async function emitSessionStart(sessionId: string, cwd: string): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionStart",
    session_id: sessionId,
    cwd,
  };
  await executeHooksForEvent("SessionStart", hookInput, { sessionId });
}

export async function emitSessionEnd(sessionId: string): Promise<void> {
  const hookInput: HookInput = {
    event: "SessionEnd",
    session_id: sessionId,
  };
  await executeHooksForEvent("SessionEnd", hookInput, { sessionId });
}
