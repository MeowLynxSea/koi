/**
 * Compaction Hook Integration
 *
 * Emits PreCompact and PostCompact events around context compaction.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitPreCompact(
  sessionId: string,
  trigger: "manual" | "auto" = "auto",
  customInstructions: string | null = null,
): Promise<void> {
  const hookInput: HookInput = {
    event: "PreCompact",
    session_id: sessionId,
    trigger,
    custom_instructions: customInstructions,
  };
  const result = await executeHooksForEvent("PreCompact", hookInput, { sessionId, matcherFilter: trigger });
  forwardHookResult(result, "PreCompact");
}

export async function emitPostCompact(
  sessionId: string,
  trigger: "manual" | "auto" = "auto",
  compactSummary?: string,
): Promise<void> {
  const hookInput: HookInput = {
    event: "PostCompact",
    session_id: sessionId,
    trigger,
    compact_summary: compactSummary,
  };
  const result = await executeHooksForEvent("PostCompact", hookInput, { sessionId, matcherFilter: trigger });
  forwardHookResult(result, "PostCompact");
}
