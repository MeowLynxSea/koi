/**
 * MCP Services - Koi Agent
 *
 * Model Context Protocol integration for Koi Agent.
 * Supports stdio, SSE, HTTP, and WebSocket transport types.
 */

// Types
export * from "./types.js";

// Configuration
export {
  setMcpConfig,
  getMcpConfig,
  getAllMcpConfigs,
  getMcpConfigsByScope,
  removeMcpConfig,
  isMcpServerDisabled,
  setMcpServerEnabled,
  getMcpServerNames,
  loadMcpConfigs,
  loadProjectMcpConfig,
  loadLocalMcpConfig,
  validateMcpConfig,
  exportMcpConfigs,
  importMcpConfigs,
} from "./config.js";

export type {
  McpConfigValidationResult,
  McpConfigExport,
} from "./config.js";

// Client
export {
  connectToServer,
  disconnectFromServer,
  callMcpTool,
  listMcpResources,
  readMcpResource,
  listMcpPrompts,
  executeMcpPrompt,
} from "./client.js";

export type { ConnectResult } from "./client.js";

// Connection Manager
export {
  initializeMcpConnections,
  connectMcpServer,
  disconnectMcpServer,
  reconnectMcpServer,
  toggleMcpServer,
  getMcpConnections,
  getMcpConnection,
  getConnectedServers,
  getAllMcpTools,
  getAllMcpResources,
  getMcpStatusSummary,
  isMcpConnecting,
  getMcpError,
  disconnectAllMcpServers,
  resetMcpConnectionManager,
  type McpConnectionProgress,
  type McpProgressCallback,
} from "./connection-manager.js";

// Stdio Transport with JSON filtering
export { FilteredStdioClientTransport } from "./stdio-transport.js";

// Commands
export {
  addMcpServer,
  removeMcpServer,
  enableMcpServer,
  disableMcpServer,
  refreshMcpServer,
  getMcpServerInfo,
  parseMcpArgs,
} from "./mcp-commands.js";
