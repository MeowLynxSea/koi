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

export function resolvePermission(id: string, allowed: boolean): void {
  const request = queue.find((r) => r.id === id);
  if (!request) return;
  queue = queue.filter((r) => r.id !== id);
  request.resolve(allowed);
  emit();
}

export function requestPermission(params: {
  toolName: string;
  args: unknown;
  reason: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    queue.push({ id, toolName: params.toolName, args: params.args, reason: params.reason, resolve });
    emit();
  });
}
