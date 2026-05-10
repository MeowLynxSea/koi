/**
 * Read MCP Resource Tool
 */

import { getMcpConnection, getAllMcpResources } from "../services/mcp/index.js";

export interface ReadMcpResourceResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ReadMcpResourceArgs {
  uri: string;
  server?: string;
}

export async function readMcpResource(args: ReadMcpResourceArgs): Promise<ReadMcpResourceResult> {
  const { uri, server: targetServer } = args;

  try {
    let resourceServer = targetServer;
    let foundResource = false;

    if (targetServer) {
      const connection = getMcpConnection(targetServer);
      if (!connection || connection.status !== "connected") {
        return { content: [{ type: "text", text: `MCP server '${targetServer}' is not connected` }], isError: true };
      }
      const resources = getAllMcpResources().filter(r => r.server === targetServer);
      foundResource = resources.some(r => r.uri === uri);
    } else {
      const allResources = getAllMcpResources();
      const resource = allResources.find(r => r.uri === uri);
      if (resource) {
        resourceServer = resource.server;
        foundResource = true;
      }
    }

    if (!foundResource || !resourceServer) {
      return { content: [{ type: "text", text: `Resource '${uri}' not found${targetServer ? ` on server '${targetServer}'` : ""}` }], isError: true };
    }

    const connection = getMcpConnection(resourceServer);
    if (!connection || connection.status !== "connected") {
      return { content: [{ type: "text", text: `Server '${resourceServer}' is not connected` }], isError: true };
    }

    const result = await connection.client.readResource({ uri });
    if (!result.contents || result.contents.length === 0) {
      return { content: [{ type: "text", text: "Resource is empty" }] };
    }

    const lines: string[] = [];
    lines.push(`# Resource: ${uri}`);
    lines.push(`Server: ${resourceServer}`);
    lines.push("");

    for (const content of result.contents) {
      const c = content as { type?: string; text?: string; mimeType?: string; blob?: string };
      if (c.type === "text") {
        lines.push("```");
        lines.push(c.text ?? "");
        lines.push("```");
      } else if (c.type === "image") {
        lines.push(`[Image resource: ${c.mimeType ?? "unknown type"}]`);
      } else if (c.type === "blob") {
        lines.push(`[Binary resource: ${c.mimeType ?? "unknown type"}]`);
      } else {
        lines.push(JSON.stringify(content, null, 2));
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error reading MCP resource: ${errorMessage}` }], isError: true };
  }
}
