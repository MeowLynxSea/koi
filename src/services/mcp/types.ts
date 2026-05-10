/**
 * MCP Types for Koi Agent
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool, Resource, ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

// Transport Types
export const TransportSchema = ["stdio", "sse", "http", "ws"] as const;
export type Transport = (typeof TransportSchema)[number];

// Configuration Types - Simple flat structure
export interface McpServerConfig {
  type?: "stdio" | "sse" | "http" | "ws";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  authToken?: string;
}

// Config Scope
export type ConfigScope = "user" | "project" | "local";

export interface ScopedMcpConfig extends McpServerConfig {
  scope: ConfigScope;
  description?: string;
  enabled?: boolean;
}

// Config File Format
export interface McpJsonConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

// Connection State Types
export type ConnectionStatus = "connected" | "failed" | "pending" | "disabled" | "disconnected";

export interface ConnectedMCPServer {
  client: Client;
  name: string;
  status: "connected";
  capabilities: ServerCapabilities;
  serverInfo?: { name: string; version: string };
  instructions?: string;
  config: ScopedMcpConfig;
  tools: Tool[];
  resources: Resource[];
  cleanup: () => Promise<void>;
}

export interface FailedMCPServer {
  name: string;
  status: "failed";
  config: ScopedMcpConfig;
  error?: string;
  lastAttempt?: number;
}

export interface PendingMCPServer {
  name: string;
  status: "pending";
  config: ScopedMcpConfig;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
}

export interface DisabledMCPServer {
  name: string;
  status: "disabled";
  config: ScopedMcpConfig;
}

export interface DisconnectedMCPServer {
  name: string;
  status: "disconnected";
  config: ScopedMcpConfig;
}

export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | PendingMCPServer
  | DisabledMCPServer
  | DisconnectedMCPServer;

// Serialized Types
export interface SerializedTool {
  name: string;
  description?: string;
  inputSchema?: Tool["inputSchema"];
  isMcp?: boolean;
  serverName?: string;
  originalToolName?: string;
}

export interface SerializedServer {
  name: string;
  status: ConnectionStatus;
  capabilities?: ServerCapabilities;
  serverInfo?: { name: string; version: string };
  error?: string;
  toolCount?: number;
  resourceCount?: number;
}

export interface MCPSerializedState {
  servers: SerializedServer[];
  configs: Record<string, ScopedMcpConfig>;
  tools: SerializedTool[];
}

// Resource Types
export interface ServerResource extends Resource {
  server: string;
  serverName?: string;
}

// MCP Tool Call Types
export interface McpToolCall {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  success: boolean;
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  error?: string;
  isError?: boolean;
}

// Configuration Validation
export function isStdioConfig(config: McpServerConfig): boolean {
  if (config.type === "stdio") return true;
  return !!config.command && !config.url;
}

export function isRemoteConfig(config: McpServerConfig): boolean {
  return !!config.url;
}

export function validateMcpServerConfig(config: unknown): config is McpServerConfig {
  if (!config || typeof config !== "object") return false;
  const obj = config as Record<string, unknown>;
  return ("command" in obj && typeof obj["command"] === "string") ||
         ("url" in obj && typeof obj["url"] === "string");
}

export function getServerTransport(config: McpServerConfig): Transport {
  if (config.type === "stdio") return "stdio";
  if (config.type === "sse" || config.type === "http" || config.type === "ws") return config.type;
  return "stdio";
}
