/**
 * List MCP Resources Tool
 *
 * Lists all available resources from connected MCP servers.
 */

import { getAllMcpResources } from "../services/mcp/index.js";

export interface ListMcpResourcesResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ListMcpResourcesArgs {
  server?: string;
}

export async function listMcpResources(args: ListMcpResourcesArgs): Promise<ListMcpResourcesResult> {
  try {
    const allResources = getAllMcpResources();
    let resources = allResources;

    // Filter by server if specified
    if (args.server) {
      resources = allResources.filter((r) => r.server === args.server);
    }

    if (resources.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: args.server
              ? `No resources found on MCP server '${args.server}'`
              : "No MCP resources available from any connected server",
          },
        ],
      };
    }

    // Group resources by server
    const byServer = new Map<string, typeof resources>();
    for (const resource of resources) {
      const existing = byServer.get(resource.server) ?? [];
      existing.push(resource);
      byServer.set(resource.server, existing);
    }

    const lines: string[] = [];
    lines.push(`# MCP Resources (${resources.length} total)\n`);

    for (const [serverName, serverResources] of byServer) {
      lines.push(`## ${serverName} (${serverResources.length} resources)`);
      for (const resource of serverResources) {
        const name = resource.name ?? resource.uri;
        const desc = resource.description
          ? `\n   ${resource.description}`
          : "";
        const mime = resource.mimeType ? ` [${resource.mimeType}]` : "";
        lines.push(`- \`${name}\`${mime}${desc}`);
      }
      lines.push("");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error listing MCP resources: ${errorMessage}` }],
      isError: true,
    };
  }
}
