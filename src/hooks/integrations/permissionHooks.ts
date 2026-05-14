/**
 * Permission Hook Integration
 *
 * Emits PermissionRequest before showing permission modal,
 * and PermissionDenied after user denies.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import type { PermissionDecision } from "../../agent/check-permissions.js";
import { forwardHookResult, emitHookStatusMessage } from "../messageSink.js";

export async function runPermissionRequestHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId?: string
): Promise<{ decision?: PermissionDecision; reason?: string }> {
  const hookInput: HookInput = {
    event: "PermissionRequest",
    tool_name: toolName,
    tool_input: toolInput,
    permission_request: { tool_name: toolName, tool_input: toolInput },
    session_id: sessionId,
  };

  const result = await executeHooksForEvent("PermissionRequest", hookInput, { sessionId });

  if (result.permissionBehavior === "allow") {
    emitHookStatusMessage(`Permission hook auto-allowed ${toolName}`);
    forwardHookResult(result, "PermissionRequest");
    return { decision: "allow" };
  }
  if (result.permissionBehavior === "deny") {
    emitHookStatusMessage(`Permission hook auto-denied ${toolName}: ${result.stopReason || "Blocked by permission hook"}`);
    forwardHookResult(result, "PermissionRequest");
    return { decision: "deny", reason: result.stopReason || "Blocked by permission hook" };
  }

  forwardHookResult(result, "PermissionRequest");
  return {};
}

export async function runPermissionDeniedHooks(
  toolName: string,
  toolInput: Record<string, unknown>,
  reason?: string,
  sessionId?: string
): Promise<void> {
  const hookInput: HookInput = {
    event: "PermissionDenied",
    tool_name: toolName,
    tool_input: toolInput,
    permission_denied: { tool_name: toolName, tool_input: toolInput, reason },
    session_id: sessionId,
  };

  const result = await executeHooksForEvent("PermissionDenied", hookInput, { sessionId });
  forwardHookResult(result, "PermissionDenied");
}
