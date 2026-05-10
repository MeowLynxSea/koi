/**
 * MCP Connection Manager
 */

import { connectToServer, disconnectFromServer, type ConnectResult } from "./client.js";
import type { MCPServerConnection, ConnectedMCPServer, FailedMCPServer, SerializedTool, ServerResource } from "./types.js";
import { getAllMcpConfigs, isMcpServerDisabled, setMcpServerEnabled, loadMcpConfigs } from "./config.js";

interface ConnectionManagerState {
  connections: Map<string, MCPServerConnection>;
  isConnecting: boolean;
  error: string | null;
}

let connectionManager: ConnectionManagerState = {
  connections: new Map(),
  isConnecting: false,
  error: null,
};

export async function initializeMcpConnections(options?: { onProgress?: (message: string) => void }): Promise<MCPServerConnection[]> {
  loadMcpConfigs();
  connectionManager.isConnecting = true;
  connectionManager.error = null;

  const configs = getAllMcpConfigs();
  const connections: MCPServerConnection[] = [];

  options?.onProgress?.(`Initializing ${configs.size} MCP servers...`);

  for (const [name, config] of configs) {
    if (isMcpServerDisabled(name)) {
      connectionManager.connections.set(name, { name, status: "disabled", config });
      continue;
    }

    options?.onProgress?.(`Connecting to ${name}...`);

    const result = await connectToServer(name, config, { onProgress: options?.onProgress });

    if (result.success && result.server) {
      connectionManager.connections.set(name, result.server);
      connections.push(result.server);
      options?.onProgress?.(`Connected to ${name}`);
    } else {
      const failedServer: FailedMCPServer = {
        name,
        status: "failed",
        config,
        error: result.error,
        lastAttempt: Date.now(),
      };
      connectionManager.connections.set(name, failedServer);
      options?.onProgress?.(`Failed to connect to ${name}: ${result.error}`);
    }
  }

  connectionManager.isConnecting = false;
  return connections;
}

export async function connectMcpServer(name: string, options?: { timeout?: number; onProgress?: (message: string) => void }): Promise<ConnectResult> {
  const configs = getAllMcpConfigs();
  const config = configs.get(name);

  if (!config) return { success: false, error: `Server '${name}' not found` };
  if (isMcpServerDisabled(name)) return { success: false, error: `Server '${name}' is disabled` };

  const result = await connectToServer(name, config, options);

  if (result.success && result.server) {
    connectionManager.connections.set(name, result.server);
  }

  return result;
}

export async function disconnectMcpServer(name: string): Promise<void> {
  const connection = connectionManager.connections.get(name);
  if (connection && connection.status === "connected") {
    await disconnectFromServer(connection);
    connectionManager.connections.delete(name);
  }
}

export function toggleMcpServer(name: string, enabled: boolean): void {
  const connection = connectionManager.connections.get(name);

  if (enabled) {
    setMcpServerEnabled(name, false);
    if (connection && connection.status === "connected") {
      disconnectFromServer(connection);
    }
    connectionManager.connections.set(name, {
      name,
      status: "disabled",
      config: connection?.config ?? getAllMcpConfigs().get(name)!,
    });
  } else {
    setMcpServerEnabled(name, false);
  }
}

export async function reconnectMcpServer(name: string, options?: { timeout?: number; onProgress?: (message: string) => void }): Promise<ConnectResult> {
  await disconnectMcpServer(name);
  setMcpServerEnabled(name, true);
  const result = await connectMcpServer(name, options);
  if (!result.success) setMcpServerEnabled(name, false);
  return result;
}

export function getMcpConnections(): Map<string, MCPServerConnection> {
  return new Map(connectionManager.connections);
}

export function getMcpConnection(name: string): MCPServerConnection | undefined {
  return connectionManager.connections.get(name);
}

export function getConnectedServers(): ConnectedMCPServer[] {
  return Array.from(connectionManager.connections.values()).filter(c => c.status === "connected") as ConnectedMCPServer[];
}

export function getAllMcpTools(): SerializedTool[] {
  const tools: SerializedTool[] = [];
  for (const connection of connectionManager.connections.values()) {
    if (connection.status === "connected") {
      for (const tool of connection.tools) {
        tools.push({
          name: `mcp__${connection.name}__${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
          isMcp: true,
          serverName: connection.name,
          originalToolName: tool.name,
        });
      }
    }
  }
  return tools;
}

export function getAllMcpResources(): ServerResource[] {
  const resources: ServerResource[] = [];
  for (const connection of connectionManager.connections.values()) {
    if (connection.status === "connected") {
      for (const resource of connection.resources) {
        resources.push({ ...resource, server: connection.name });
      }
    }
  }
  return resources;
}

export function getMcpStatusSummary(): { total: number; connected: number; failed: number; disabled: number; pending: number } {
  let connected = 0;
  let failed = 0;
  let disabled = 0;
  let pending = 0;

  for (const connection of connectionManager.connections.values()) {
    switch (connection.status) {
      case "connected": connected++; break;
      case "failed": failed++; break;
      case "disabled": disabled++; break;
      case "pending": pending++; break;
    }
  }

  return { total: connectionManager.connections.size, connected, failed, disabled, pending };
}

export function isMcpConnecting(): boolean {
  return connectionManager.isConnecting;
}

export function getMcpError(): string | null {
  return connectionManager.error;
}

export async function disconnectAllMcpServers(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const connection of connectionManager.connections.values()) {
    if (connection.status === "connected") {
      promises.push(disconnectFromServer(connection));
    }
  }
  await Promise.all(promises);
  connectionManager.connections.clear();
}

export function resetMcpConnectionManager(): void {
  connectionManager = { connections: new Map(), isConnecting: false, error: null };
}
