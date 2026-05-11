/**
 * MCP Tool Adapter
 */

import type { McpToolResult, SerializedTool } from "../services/mcp/types.js";
import { getMcpConnection } from "../services/mcp/index.js";
import { truncateToolContent, MCP_TOOL_LIMITS } from "../agent/tool-output-guard.js";

export interface KoiMcpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  serverName: string;
  originalToolName: string;
}

export function createMcpToolDefinition(tool: SerializedTool): KoiMcpTool {
  const parts = tool.name.split("__");
  if (parts.length !== 3 || parts[0] !== "mcp") {
    throw new Error(`Invalid MCP tool name format: ${tool.name}`);
  }

  const serverName = parts[1] ?? "";
  const originalToolName = parts[2] ?? "";

  if (!originalToolName) throw new Error("Tool name is required");

  return {
    name: tool.name,
    description: tool.description ?? `MCP tool from ${serverName}: ${originalToolName}`,
    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    serverName,
    originalToolName,
  };
}

export async function executeMcpToolCall(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const parts = toolName.split("__");
  if (parts.length !== 3 || parts[0] !== "mcp") {
    return { success: false, error: `Invalid MCP tool name: ${toolName}`, isError: true };
  }

  const serverName = parts[1] ?? "";
  const originalToolName = parts[2] ?? "";

  if (!originalToolName) {
    return { success: false, error: "Tool name is required", isError: true };
  }

  const connection = getMcpConnection(serverName);
  if (!connection || connection.status !== "connected") {
    return { success: false, error: `MCP server '${serverName}' is not connected`, isError: true };
  }

  try {
    const result = await connection.client.callTool({ name: originalToolName, arguments: args });

    // 截断过长的结果（双重保障：也在 afterToolCall 钩子层截断）
    const originalContent = result.content as Array<{ type: string; text?: string; [key: string]: unknown }>;
    const { content: truncatedContent, wasTruncated } = truncateToolContent(
      originalContent as Parameters<typeof truncateToolContent>[0],
      MCP_TOOL_LIMITS
    );

    return {
      success: true,
      content: truncatedContent as McpToolResult["content"],
      isTruncated: wasTruncated,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage, isError: true, content: [{ type: "text", text: errorMessage }] };
  }
}

export function createMcpToolDefinitions(): KoiMcpTool[] {
  const { getAllMcpTools } = require("../services/mcp/index.js") as { getAllMcpTools: () => SerializedTool[] };
  const mcpTools = getAllMcpTools();
  return mcpTools.map((tool: SerializedTool) => createMcpToolDefinition(tool));
}

export function formatMcpToolResult(result: McpToolResult): string {
  if (!result.success) return `Error: ${result.error ?? "Unknown error"}`;
  if (!result.content || result.content.length === 0) return "No content returned";
  return result.content.map((block) => {
    if (block.type === "text") return block.text ?? "";
    return JSON.stringify(block);
  }).join("\n");
}
