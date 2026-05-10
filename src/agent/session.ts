/**
 * Agent Session Utilities
 *
 * Helper functions for agent session management.
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";

/**
 * Refresh MCP tools in the agent session.
 * Call this after MCP connections change (connect/disconnect).
 */
export async function refreshMcpTools(session: AgentSession | null): Promise<void> {
  if (!session) return;

  // Re-initialize MCP connections
  const { disconnectAllMcpServers, initializeMcpConnections } = await import("../services/mcp/index.js");
  await disconnectAllMcpServers();
  await initializeMcpConnections();

  // Get current mode and update active tools
  const { getAgentMode, getActiveToolNamesForMode } = await import("./mode.js");
  const mode = getAgentMode();
  const activeTools = getActiveToolNamesForMode(mode);

  session.setActiveToolsByName(activeTools);
}
