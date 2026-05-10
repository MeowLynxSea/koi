/**
 * MCP Command Support
 */

import type { ScopedMcpConfig } from "./types.js";
import { getMcpConfig, setMcpConfig, removeMcpConfig, isMcpServerDisabled, setMcpServerEnabled, validateMcpConfig } from "./config.js";
import { connectMcpServer, disconnectMcpServer, reconnectMcpServer, getMcpConnections } from "./connection-manager.js";

export async function addMcpServer(name: string, config: Partial<ScopedMcpConfig>): Promise<{ success: boolean; error?: string; warning?: string }> {
  const validation = validateMcpConfig(name, config);
  if (!validation.valid) {
    return { success: false, error: validation.errors?.join(", ") ?? "Invalid configuration" };
  }

  const existing = getMcpConfig(name);
  if (existing) {
    return { success: false, error: `Server '${name}' already exists` };
  }

  setMcpConfig(name, config, "user");
  const result = await connectMcpServer(name);
  if (!result.success) {
    return { success: true, warning: `Server added but failed to connect: ${result.error}` };
  }
  return { success: true };
}

export function removeMcpServer(name: string): { success: boolean; error?: string } {
  const config = getMcpConfig(name);
  if (!config) return { success: false, error: `Server '${name}' not found` };
  disconnectMcpServer(name).catch(() => {});
  removeMcpConfig(name);
  return { success: true };
}

export function enableMcpServer(name: string): { success: boolean; error?: string } {
  const config = getMcpConfig(name);
  if (!config) return { success: false, error: `Server '${name}' not found` };
  setMcpServerEnabled(name, true);
  return { success: true };
}

export function disableMcpServer(name: string): { success: boolean; error?: string } {
  const config = getMcpConfig(name);
  if (!config) return { success: false, error: `Server '${name}' not found` };
  setMcpServerEnabled(name, false);
  disconnectMcpServer(name).catch(() => {});
  return { success: true };
}

export async function refreshMcpServer(name: string, options?: { onProgress?: (message: string) => void }): Promise<{ success: boolean; error?: string }> {
  const config = getMcpConfig(name);
  if (!config) return { success: false, error: `Server '${name}' not found` };
  options?.onProgress?.(`Reconnecting to ${name}...`);
  const result = await reconnectMcpServer(name, { onProgress: options?.onProgress });
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export function getMcpServerInfo(name: string): {
  name: string;
  config?: Partial<ScopedMcpConfig>;
  status: string;
  toolCount?: number;
  resourceCount?: number;
  error?: string;
} {
  const config = getMcpConfig(name);
  if (!config) return { name, status: "not_found" };
  const connection = getMcpConnections().get(name);
  const status = connection?.status ?? (isMcpServerDisabled(name) ? "disabled" : "disconnected");
  const connectedConn = connection?.status === "connected" ? connection : null;
  return {
    name,
    config,
    status,
    toolCount: connectedConn?.tools?.length,
    resourceCount: connectedConn?.resources?.length,
    error: connection?.status === "failed" ? (connection as { error?: string }).error : undefined,
  };
}

export function parseMcpArgs(args: string): {
  name?: string;
  type?: "stdio" | "sse" | "http" | "ws";
  command?: string;
  url?: string;
  args?: string[];
} {
  const result: { name?: string; type?: "stdio" | "sse" | "http" | "ws"; command?: string; url?: string; args?: string[] } = {};
  const parts = args.trim().split(/\s+/);
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    if (part === "--stdio" || part === "-s") { result.type = "stdio"; i++; }
    else if (part === "--sse" || part === "-e") { result.type = "sse"; i++; }
    else if (part === "--http" || part === "-h") { result.type = "http"; i++; }
    else if (part === "--ws" || part === "-w") { result.type = "ws"; i++; }
    else if (part === "--name" || part === "-n") { result.name = parts[++i]; i++; }
    else if (part.startsWith("-")) { i++; }
    else if (!result.name && !result.command && !result.url) {
      if (part.includes("://")) { result.url = part; }
      else { result.command = part; }
      i++;
    } else if (result.command || result.url) {
      result.args = result.args ?? [];
      result.args.push(part);
      i++;
    } else {
      i++;
    }
  }
  return result;
}
