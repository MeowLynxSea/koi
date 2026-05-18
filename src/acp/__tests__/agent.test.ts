/**
 * ACP Agent Integration Tests
 *
 * Tests KoiAcpAgent via in-memory bidirectional streams.
 *
 * NOTE: Run with `bun test` or `npx vitest` after installing vitest:
 *   bun add -d vitest
 */

// Uncomment after installing vitest:
// import { describe, it, expect } from "vitest";
// import {
//   ClientSideConnection,
//   AgentSideConnection,
//   PROTOCOL_VERSION,
//   ndJsonStream,
// } from "@agentclientprotocol/sdk";
// import { KoiAcpAgent } from "../agent.js";
//
// describe("KoiAcpAgent", () => {
//   async function createTestPair() {
//     const clientToAgent = new TransformStream<Uint8Array>();
//     const agentToClient = new TransformStream<Uint8Array>();
//
//     const agentConn = new AgentSideConnection(
//       (conn) => new KoiAcpAgent(conn),
//       ndJsonStream(
//         agentToClient.writable as unknown as WritableStream<Uint8Array>,
//         clientToAgent.readable as unknown as ReadableStream<Uint8Array>
//       )
//     );
//
//     const clientConn = new ClientSideConnection(
//       () => ({
//         async requestPermission() {
//           return {
//             outcome: { outcome: "selected", optionId: "allow" },
//           };
//         },
//         async sessionUpdate() {},
//         async writeTextFile() { return {}; },
//         async readTextFile() { return { content: "" }; },
//       }),
//       ndJsonStream(
//         clientToAgent.writable as unknown as WritableStream<Uint8Array>,
//         agentToClient.readable as unknown as ReadableStream<Uint8Array>
//       )
//     );
//
//     return { clientConn, agentConn };
//   }
//
//   it("responds to initialize", async () => {
//     const { clientConn } = await createTestPair();
//     const response = await clientConn.initialize({
//       protocolVersion: PROTOCOL_VERSION,
//       clientCapabilities: {},
//       clientInfo: { name: "test", version: "1.0" },
//     });
//     expect(response.protocolVersion).toBe(PROTOCOL_VERSION);
//     expect(response.agentInfo?.name).toBe("koi");
//   });
// });
