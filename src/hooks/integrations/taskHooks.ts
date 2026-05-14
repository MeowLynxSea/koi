/**
 * Task Hook Integration
 *
 * Emits TaskCreated and TaskCompleted events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitTaskCreated(
  taskId: string,
  description: string,
  sessionId?: string
): Promise<void> {
  const hookInput: HookInput = {
    event: "TaskCreated",
    session_id: sessionId,
    task_id: taskId,
    task_description: description,
  };
  const result = await executeHooksForEvent("TaskCreated", hookInput, { sessionId });
  forwardHookResult(result, "TaskCreated");
}

export async function emitTaskCompleted(
  taskId: string,
  description: string,
  sessionId?: string
): Promise<void> {
  const hookInput: HookInput = {
    event: "TaskCompleted",
    session_id: sessionId,
    task_id: taskId,
    task_description: description,
  };
  const result = await executeHooksForEvent("TaskCompleted", hookInput, { sessionId });
  forwardHookResult(result, "TaskCompleted");
}
