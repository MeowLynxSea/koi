/**
 * MCP Client Connection
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool, Resource, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import type { ScopedMcpConfig, ConnectedMCPServer } from "./types.js";
import { FilteredStdioClientTransport } from "./stdio-transport.js";

const CONNECTION_TIMEOUT = 60000;

async function createTransport(config: ScopedMcpConfig) {
  if (config.type === "stdio" && config.command) {
    return new FilteredStdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
    });
  }

  if (config.url) {
    const type = config.type ?? "http";
    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    if (config.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken}`;
    }
    const url = new URL(config.url);

    switch (type) {
      case "sse":
        return new SSEClientTransport(url);
      default:
        return new StreamableHTTPClientTransport(url);
    }
  }

  throw new Error("Invalid MCP server configuration");
}

export interface ConnectResult {
  success: boolean;
  server?: ConnectedMCPServer;
  error?: string;
}

export async function connectToServer(
  name: string,
  config: ScopedMcpConfig,
  options?: { timeout?: number; onProgress?: (message: string) => void }
): Promise<ConnectResult> {
  const timeout = options?.timeout ?? CONNECTION_TIMEOUT;

  try {
    options?.onProgress?.(`Connecting to ${name}...`);
    const transport = await createTransport(config);

    const client = new Client(
      { name: "koi", version: "1.0.0" },
      { capabilities: {} }
    );

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    try {
      await client.connect(transport);
      clearTimeout(timeoutId);
      options?.onProgress?.(`Connected to ${name}`);

      // Make these optional - not all MCP servers support all methods
      let serverInfo: Record<string, unknown> = { name: "unknown", version: "0.0.0" };
      try {
        const versionResult = client.getServerVersion();
        // Handle both sync and async versions
        if (versionResult instanceof Promise) {
          serverInfo = await versionResult as Record<string, unknown>;
        } else {
          serverInfo = versionResult as Record<string, unknown>;
        }
      } catch {
        // Server may not support getServerVersion
      }

      let toolsResponse = { tools: [] as Tool[] };
      try {
        const result = client.listTools();
        toolsResponse = "then" in result ? await result : result;
      } catch {
        // Server may not support tools
      }

      let resourcesResponse = { resources: [] as Resource[] };
      try {
        const result = client.listResources();
        resourcesResponse = "then" in result ? await result : result;
      } catch {
        // Server may not support resources
      }

      let instructions: string | undefined;
      try {
        instructions = client.getInstructions();
      } catch {
        // Instructions not available
      }

      const cleanup = async () => {
        try {
          await client.close();
        } catch {
          // Ignore cleanup errors
        }
      };

      // Access properties using bracket notation to avoid TS errors
      const info = serverInfo as Record<string, unknown>;
      const capabilities = (info["capabilities"] as ServerCapabilities | undefined) ?? {};
      const infoName = (info["name"] as string | undefined) ?? "unknown";
      const infoVersion = (info["version"] as string | undefined) ?? "0.0.0";

      const server: ConnectedMCPServer = {
        client,
        name,
        status: "connected",
        capabilities,
        serverInfo: { name: infoName, version: infoVersion },
        instructions,
        config,
        tools: (toolsResponse.tools ?? []) as Tool[],
        resources: (resourcesResponse.resources ?? []) as Resource[],
        cleanup,
      };

      return { success: true, server };
    } catch (connectError) {
      clearTimeout(timeoutId);
      throw connectError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    options?.onProgress?.(`Failed to connect to ${name}: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function disconnectFromServer(server: ConnectedMCPServer): Promise<void> {
  await server.cleanup();
}

export async function callMcpTool(
  server: ConnectedMCPServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; content?: Array<Record<string, unknown>>; error?: string }> {
  try {
    const result = await server.client.callTool({ name: toolName, arguments: args });
    return { success: true, content: result.content as Array<Record<string, unknown>> };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

export async function listMcpResources(server: ConnectedMCPServer) {
  const response = await server.client.listResources();
  return response.resources ?? [];
}

export async function readMcpResource(server: ConnectedMCPServer, uri: string) {
  try {
    return await server.client.readResource({ uri });
  } catch {
    return null;
  }
}

export async function listMcpPrompts(server: ConnectedMCPServer) {
  const response = await server.client.listPrompts();
  return response.prompts ?? [];
}

export async function executeMcpPrompt(
  server: ConnectedMCPServer,
  promptName: string,
  args?: Record<string, string>
) {
  try {
    return await server.client.getPrompt({ name: promptName, arguments: args });
  } catch {
    return null;
  }
}
