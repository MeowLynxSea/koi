/**
 * Permission UI Bridge
 *
 * Provides a decoupled way for tool execute() functions to request
 * user confirmation via the TUI layer without depending on ExtensionContext.
 *
 * Usage:
 *   const result = await requestPermission({ toolName: "bash", args: { command: "rm -rf /" } });
 *   // result is true if user allowed, false if denied
 */

export interface PermissionRequest {
  id: string;
  toolName: string;
  args: unknown;
  reason: string;
  resolve: (allowed: boolean) => void;
}

let queue: PermissionRequest[] = [];
let listeners: (() => void)[] = [];
let yoloMode = false;

export function isYoloMode(): boolean {
  return yoloMode;
}

export function setYoloMode(enabled: boolean): void {
  yoloMode = enabled;
}

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribePermissions(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getPermissionQueue(): PermissionRequest[] {
  return queue;
}

export async function resolvePermission(id: string, allowed: boolean): Promise<void> {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);

  if (!allowed) {
    await runPermissionDeniedHooks(
      request.toolName,
      request.args as Record<string, unknown>,
      request.reason
    );
  }

  request.resolve(allowed);
  emit();
}

import { runPermissionRequestHooks, runPermissionDeniedHooks } from "../hooks/integrations/permissionHooks.js";

export async function requestPermission(params: {
  toolName: string;
  args: unknown;
  reason: string;
}): Promise<boolean> {
  // Run PermissionRequest hooks first
  const hookResult = await runPermissionRequestHooks(params.toolName, params.args as Record<string, unknown>);
  if (hookResult.decision === "allow") {
    return true;
  }
  if (hookResult.decision === "deny") {
    await runPermissionDeniedHooks(params.toolName, params.args as Record<string, unknown>, hookResult.reason);
    return false;
  }

  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({ id, toolName: params.toolName, args: params.args, reason: params.reason, resolve });
    emit();
  });
}
