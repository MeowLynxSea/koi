/**
 * Lifecycle Hook Integration
 *
 * Emits Setup, Stop, StopFailure, Notification, and CwdChanged events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitSetup(): Promise<void> {
  const hookInput: HookInput = {
    event: "Setup",
  };
  const result = await executeHooksForEvent("Setup", hookInput);
  forwardHookResult(result, "Setup");
}

export async function emitStop(sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "Stop",
    session_id: sessionId,
  };
  const result = await executeHooksForEvent("Stop", hookInput, { sessionId });
  forwardHookResult(result, "Stop");
}

export async function emitStopFailure(error: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "StopFailure",
    session_id: sessionId,
    tool_error: error,
  };
  const result = await executeHooksForEvent("StopFailure", hookInput, { sessionId });
  forwardHookResult(result, "StopFailure");
}

export async function emitNotification(message: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "Notification",
    session_id: sessionId,
    tool_output: message,
  };
  const result = await executeHooksForEvent("Notification", hookInput, { sessionId });
  forwardHookResult(result, "Notification");
}

export async function emitCwdChanged(cwd: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "CwdChanged",
    session_id: sessionId,
    cwd,
  };
  const result = await executeHooksForEvent("CwdChanged", hookInput, { sessionId });
  forwardHookResult(result, "CwdChanged");
}
