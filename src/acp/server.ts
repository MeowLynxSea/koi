/**
 * ACP Server
 *
 * Starts Koi in Agent Client Protocol mode over stdio.
 */

import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { KoiAcpAgent } from "./agent.js";
import { sessionBridge } from "./session-bridge.js";
import { acpLogger } from "./logger.js";

export async function runAcpServer(): Promise<void> {
  acpLogger.info("Starting Koi ACP server over stdio");

  const input = Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>;

  const stream = ndJsonStream(output, input);

  const connection = new AgentSideConnection(
    (conn) => new KoiAcpAgent(conn),
    stream
  );

  acpLogger.info("AgentSideConnection established, waiting for client...");

  // Keep connection alive; cleanup on close
  connection.signal.addEventListener("abort", async () => {
    acpLogger.info("ACP connection closed, cleaning up sessions...");
    await sessionBridge.closeAllSessions();
    process.exit(0);
  });
}
