/**
 * Compaction Hook Integration
 *
 * Emits PreCompact and PostCompact events around context compaction.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

export async function emitPreCompact(sessionId: string): Promise<void> {
  const hookInput: HookInput = {
    event: "PreCompact",
    session_id: sessionId,
  };
  await executeHooksForEvent("PreCompact", hookInput, { sessionId });
}

export async function emitPostCompact(sessionId: string): Promise<void> {
  const hookInput: HookInput = {
    event: "PostCompact",
    session_id: sessionId,
  };
  await executeHooksForEvent("PostCompact", hookInput, { sessionId });
}
