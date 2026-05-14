/**
 * Lifecycle Hook Integration
 *
 * Emits Setup, Stop, StopFailure, Notification, and CwdChanged events.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

export async function emitSetup(): Promise<void> {
  const hookInput: HookInput = {
    event: "Setup",
  };
  await executeHooksForEvent("Setup", hookInput);
}

export async function emitStop(sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "Stop",
    session_id: sessionId,
  };
  await executeHooksForEvent("Stop", hookInput, { sessionId });
}

export async function emitStopFailure(error: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "StopFailure",
    session_id: sessionId,
    tool_error: error,
  };
  await executeHooksForEvent("StopFailure", hookInput, { sessionId });
}

export async function emitNotification(message: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "Notification",
    session_id: sessionId,
    tool_output: message,
  };
  await executeHooksForEvent("Notification", hookInput, { sessionId });
}

export async function emitCwdChanged(cwd: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "CwdChanged",
    session_id: sessionId,
    cwd,
  };
  await executeHooksForEvent("CwdChanged", hookInput, { sessionId });
}
