/**
 * Subagent Hook Integration
 *
 * Emits SubagentStart and SubagentStop around subagent execution.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitSubagentStart(
  description: string,
  sessionId?: string
): Promise<void> {
  const hookInput: HookInput = {
    event: "SubagentStart",
    session_id: sessionId,
    task_description: description,
  };
  const result = await executeHooksForEvent("SubagentStart", hookInput, { sessionId });
  forwardHookResult(result, "SubagentStart");
}

export async function emitSubagentStop(
  description: string,
  result?: string,
  sessionId?: string
): Promise<void> {
  const hookInput: HookInput = {
    event: "SubagentStop",
    session_id: sessionId,
    task_description: description,
    tool_output: result,
  };
  const hookResult = await executeHooksForEvent("SubagentStop", hookInput, { sessionId });
  forwardHookResult(hookResult, "SubagentStop");
}
