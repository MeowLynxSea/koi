/**
 * Agent Session Manager
 *
 * Creates a full Pi AgentSession with all infrastructure:
 * AuthStorage, ModelRegistry, SettingsManager, SessionManager, ResourceLoader,
 * ExtensionRunner, and built-in coding tools.
 */

import path from "path";
import os from "os";
import { createAgentSession, defineTool } from "@mariozechner/pi-coding-agent";
import type {
  AgentSession,
  CreateAgentSessionResult,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import {
  getPiAuthStorage,
  getPiModelRegistry,
  getPiSettingsManager,
  getCurrentPiModel,
} from "../config/settings.js";
import { createCodingToolDefinitions } from "../tools/index.js";
import { globalTaskManager } from "./session-tasks.js";
import {
  initializeMcpConnections,
  disconnectAllMcpServers,
  getAllMcpTools,
  getMcpConnection,
} from "../services/mcp/index.js";
import { getAgentMode } from "./mode.js";


const PI_AGENT_DIR = path.join(os.homedir(), ".config", "koi", "pi");

/**
 * Convert MCP tools to Pi ToolDefinition format.
 * This allows MCP tools to be registered with the agent session.
 */
function createMcpToolDefinitions(): ToolDefinition[] {
  const mcpTools = getAllMcpTools();
  return mcpTools.map((tool) => {
    const serverName: string = tool.serverName ?? "";
    const toolName: string = tool.originalToolName ?? tool.name;
    
    // Create a TypeBox schema from the input schema
    const inputSchema = tool.inputSchema || {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    if (typeof inputSchema === "object" && inputSchema !== null) {
      const schema = inputSchema as Record<string, unknown>;
      
      if (schema["properties"] && typeof schema["properties"] === "object") {
        const props = schema["properties"] as Record<string, unknown>;
        for (const [key, value] of Object.entries(props)) {
          properties[key] = convertJsonSchemaToTypeBox(value);
        }
      }
      
      if (Array.isArray(schema["required"])) {
        required.push(...(schema["required"] as string[]));
      }
    }
    
    // @ts-expect-error - TypeBox TProperties type is too strict for dynamic schemas
    const typeboxSchema = Type.Object(properties, {
      additionalProperties: true,
    });
    
    return defineTool({
      name: tool.name,
      label: `${serverName}: ${toolName}`,
      description: tool.description || `MCP tool from ${serverName}`,
      parameters: typeboxSchema,
      // @ts-expect-error - execute signature compatibility with dynamic tools
      execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
        try {
          const connection = getMcpConnection(serverName);
          if (!connection || connection.status !== "connected") {
            return {
              content: [{ type: "text" as const, text: `MCP server '${serverName}' is not connected` }],
              isError: true,
            };
          }
          
          const result = await connection.client.callTool({
            name: toolName,
            arguments: params as Record<string, unknown>,
          });
          
          return {
            content: (result.content ?? []) as Array<{ type: string; text?: string; [key: string]: unknown }>,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true,
          };
        }
      },
    });
  });
}

/**
 * Convert JSON Schema to TypeBox format
 */
function convertJsonSchemaToTypeBox(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") {
    return { type: "string" };
  }
  
  const s = schema as Record<string, unknown>;
  
  const type = s["type"] as string | undefined;
  if (type === "string") return Type.String();
  if (type === "number" || type === "integer") return Type.Number();
  if (type === "boolean") return Type.Boolean();
  if (type === "array") {
    const items = s["items"] ? convertJsonSchemaToTypeBox(s["items"]) : Type.String();
    // @ts-expect-error - TypeBox TSchema type is too strict for dynamic schemas
    return Type.Array(items);
  }
  if (type === "object") {
    const properties: Record<string, unknown> = {};
    const props = s["properties"] as Record<string, unknown> | undefined;
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        properties[key] = convertJsonSchemaToTypeBox(value);
      }
    }
    // @ts-expect-error - TypeBox TProperties type is too strict for dynamic schemas
    return Type.Object(properties);
  }
  
  return Type.String();
}

export async function createKoiSession(): Promise<CreateAgentSessionResult> {
  const authStorage = getPiAuthStorage();
  const modelRegistry = getPiModelRegistry();
  const settingsManager = getPiSettingsManager();
  const currentModel = getCurrentPiModel();

  // Initialize MCP connections first to get tool definitions
  await disconnectAllMcpServers();
  await initializeMcpConnections();
  
  // Create MCP tool definitions
  const mcpToolDefs = createMcpToolDefinitions();
  
  // Combine custom tools with MCP tools
  const codingTools = createCodingToolDefinitions(process.cwd(), globalTaskManager);
  const customTools = [...codingTools, ...mcpToolDefs];

  // Get MCP tool names for initial activation
  const mcpToolNames = mcpToolDefs.map((tool) => tool.name);
  
  // Default active tool names (same as pi's default)
  const defaultActiveToolNames = ["read", "bash", "edit", "write"];
  
  // Combine default tools with MCP tools for initial activation
  // This ensures MCP tools are in initialActiveToolNames and won't be filtered out
  const initialActiveTools = [...defaultActiveToolNames, ...mcpToolNames];

  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage,
    modelRegistry,
    settingsManager,
    model: currentModel,
    tools: initialActiveTools,
    customTools,
  });

  // Get current mode and update active tools
  const mode = getAgentMode();
  const { getActiveToolNamesForMode } = await import("./mode.js");
  const activeTools = getActiveToolNamesForMode(mode);
  result.session.setActiveToolsByName(activeTools);

  return result;
}

/**
 * Refresh MCP tools in the agent session.
 * Call this after MCP connections change (connect/disconnect).
 * Note: Since Pi's session doesn't support dynamic tool registration,
 * we need to reconnect with new MCP tools. This is a limitation.
 */
export async function refreshMcpTools(session: AgentSession | null): Promise<void> {
  if (!session) return;

  // Re-initialize MCP connections
  await disconnectAllMcpServers();
  await initializeMcpConnections();

  // Get current mode and update active tools
  const mode = getAgentMode();
  const { getActiveToolNamesForMode } = await import("./mode.js");
  const activeTools = getActiveToolNamesForMode(mode);

  session.setActiveToolsByName(activeTools);
}

export type { AgentSession, CreateAgentSessionResult };
