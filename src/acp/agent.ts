/**
 * Koi ACP Agent
 *
 * Implements the ACP Agent interface, bridging ACP requests to Koi's
 * existing AgentSession, tool, and MCP infrastructure.
 */

import type {
  AgentSideConnection,
  Agent as AcpAgent,
} from "@agentclientprotocol/sdk";
import * as acp from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import type {
  AgentSessionEvent,
  AgentSession,
} from "@mariozechner/pi-coding-agent";
import type { TextContent as PiTextContent } from "@mariozechner/pi-ai";
import { sessionBridge } from "./session-bridge.js";
import { acpLogger } from "./logger.js";
import { setAgentMode, getAgentMode, type AgentMode } from "../agent/mode.js";
import { setActiveAcpConnection, clearActiveAcpConnection } from "./permission-bridge.js";
import { getAvailablePiModels, resolvePiModel, getCurrentPiModel } from "../config/settings.js";

const KOI_VERSION = "0.2.20";

const ACP_MODES: acp.SessionMode[] = [
  { id: "build", name: "Build", description: "Full tool access" },
  { id: "ask", name: "Ask", description: "Read-only tools" },
  { id: "plan", name: "Plan", description: "Planning mode" },
];

function mapKoiModeToAcp(mode: AgentMode): acp.SessionModeId {
  return mode;
}

function mapAcpModeToKoi(modeId: acp.SessionModeId): AgentMode {
  if (modeId === "ask" || modeId === "plan" || modeId === "build") {
    return modeId;
  }
  return "build";
}

function mapPiStopReasonToAcp(piReason: string): acp.StopReason {
  switch (piReason) {
    case "length":
      return "max_tokens";
    case "error":
      return "refusal";
    case "aborted":
      return "cancelled";
    case "toolUse":
    case "stop":
    default:
      return "end_turn";
  }
}

function mapToolKind(toolName: string): acp.ToolKind {
  switch (toolName) {
    case "read_file":
    case "read":
      return "read";
    case "edit":
    case "edit_file":
      return "edit";
    case "write_file":
    case "create_file":
      return "edit";
    case "bash":
    case "exec":
      return "execute";
    case "grep":
    case "find":
      return "search";
    case "rm":
    case "delete_file":
      return "delete";
    case "mv":
    case "move_file":
      return "move";
    case "webfetch":
    case "curl":
      return "fetch";
    case "think":
      return "think";
    default:
      return "other";
  }
}

function extractToolLocations(
  _toolName: string,
  args: unknown
): acp.ToolCallLocation[] | undefined {
  const a = args as Record<string, unknown> | undefined;
  if (!a) return undefined;

  const paths: string[] = [];

  // Common file-path fields across Koi tools
  if (typeof a["path"] === "string") paths.push(a["path"]);
  if (typeof a["filePath"] === "string") paths.push(a["filePath"]);
  if (typeof a["target"] === "string") paths.push(a["target"]);
  if (typeof a["source"] === "string") paths.push(a["source"]);
  if (typeof a["oldPath"] === "string") paths.push(a["oldPath"]);
  if (typeof a["newPath"] === "string") paths.push(a["newPath"]);

  if (paths.length === 0) return undefined;

  return paths.map((p) => ({ path: p }));
}

function buildConfigOptions(): acp.SessionConfigOption[] {
  const models = getAvailablePiModels();
  const currentModel = getAvailablePiModels().find((m) => m.id === getCurrentPiModel()?.id);

  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: currentModel
        ? `${currentModel.provider}:${currentModel.id}`
        : models[0]
          ? `${models[0].provider}:${models[0].id}`
          : "",
      options: [
        {
          group: "models",
          name: "Available Models",
          options: models.map((m) => ({
            value: `${m.provider}:${m.id}`,
            name: m.name,
            description: `${m.provider} — ${m.id}`,
          })),
        },
      ],
    },
  ];
}

export class KoiAcpAgent implements AcpAgent {
  private connection: AgentSideConnection;
  /** Tracks how much assistant text has already been sent per session, for incremental streaming. */
  private sentTextLengths = new Map<string, number>();
  /** Tracks the last stop reason per session for accurate PromptResponse. */
  private lastStopReasons = new Map<string, acp.StopReason>();

  constructor(connection: AgentSideConnection) {
    this.connection = connection;
  }

  async initialize(
    params: acp.InitializeRequest
  ): Promise<acp.InitializeResponse> {
    acpLogger.info(
      "ACP initialize from",
      params.clientInfo?.name || "unknown",
      params.clientInfo?.version || ""
    );

    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentInfo: {
        name: "koi",
        version: KOI_VERSION,
      },
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          list: {},
          close: {},
          resume: {},
        },
        promptCapabilities: {
          image: true,
          audio: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
      },
    };
  }

  async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse> {
    // No auth required for now
    return {};
  }

  async newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
    const sessionId = await sessionBridge.createSession(params.cwd, params.mcpServers);
    const currentMode = getAgentMode();

    return {
      sessionId,
      modes: {
        availableModes: ACP_MODES,
        currentModeId: mapKoiModeToAcp(currentMode),
      },
      configOptions: buildConfigOptions(),
    };
  }

  async loadSession(params: acp.LoadSessionRequest): Promise<acp.LoadSessionResponse> {
    // Find the session file path from sessionId
    const sessions = await sessionBridge.listAllSessions();
    const meta = sessions.find((s) => s.id === params.sessionId);
    if (!meta) {
      throw RequestError.resourceNotFound(params.sessionId);
    }

    const sessionId = await sessionBridge.loadExistingSession(meta.filePath, params.mcpServers);
    const entry = sessionBridge.getSession(sessionId);
    if (entry) {
      await this.replayHistory(sessionId, entry.agentSession);
    }
    const currentMode = getAgentMode();

    return {
      modes: {
        availableModes: ACP_MODES,
        currentModeId: mapKoiModeToAcp(currentMode),
      },
      configOptions: buildConfigOptions(),
    };
  }

  async listSessions(_params: acp.ListSessionsRequest): Promise<acp.ListSessionsResponse> {
    const sessions = await sessionBridge.listAllSessions();
    return {
      sessions: sessions.map((s) => ({
        sessionId: s.id,
        cwd: s.cwd,
        title: s.title,
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  }

  async resumeSession(params: acp.ResumeSessionRequest): Promise<acp.ResumeSessionResponse> {
    const sessions = await sessionBridge.listAllSessions();
    const meta = sessions.find((s) => s.id === params.sessionId);
    if (!meta) {
      throw RequestError.resourceNotFound(params.sessionId);
    }

    const sessionId = await sessionBridge.loadExistingSession(meta.filePath, params.mcpServers);
    const entry = sessionBridge.getSession(sessionId);
    if (entry) {
      await this.replayHistory(sessionId, entry.agentSession);
    }
    const currentMode = getAgentMode();

    return {
      modes: {
        availableModes: ACP_MODES,
        currentModeId: mapKoiModeToAcp(currentMode),
      },
      configOptions: buildConfigOptions(),
    };
  }

  async closeSession(params: acp.CloseSessionRequest): Promise<acp.CloseSessionResponse> {
    const entry = sessionBridge.getSession(params.sessionId);
    if (!entry) {
      throw RequestError.invalidParams({ sessionId: params.sessionId }, "Session not found");
    }
    await sessionBridge.closeSession(params.sessionId);
    return {};
  }

  async setSessionConfigOption(
    params: acp.SetSessionConfigOptionRequest
  ): Promise<acp.SetSessionConfigOptionResponse> {
    const entry = sessionBridge.getSession(params.sessionId);
    if (!entry) {
      throw RequestError.invalidParams({ sessionId: params.sessionId }, "Session not found");
    }

    if (params.configId === "model") {
      const modelRef =
        typeof params.value === "string" ? params.value : undefined;
      if (modelRef) {
        const model = resolvePiModel({
          provider: modelRef.split(":")[0] ?? "",
          modelId: modelRef.split(":").slice(1).join(":"),
        });
        if (model) {
          await entry.agentSession.setModel(model);
        }
      }
    }

    return {
      configOptions: buildConfigOptions(),
    };
  }

  async setSessionMode(params: acp.SetSessionModeRequest): Promise<acp.SetSessionModeResponse> {
    const entry = sessionBridge.getSession(params.sessionId);
    if (!entry) {
      throw RequestError.invalidParams({ sessionId: params.sessionId }, "Session not found");
    }

    const koiMode = mapAcpModeToKoi(params.modeId);
    setAgentMode(koiMode);

    // Notify client of mode change
    await this.connection.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "current_mode_update",
        currentModeId: params.modeId,
      },
    });

    return {};
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const entry = sessionBridge.getSession(params.sessionId);
    if (!entry) {
      throw RequestError.invalidParams({ sessionId: params.sessionId }, "Session not found");
    }

    const { agentSession } = entry;

    // Extract text, images, and resources from ACP content blocks
    const textParts: string[] = [];
    const images: { type: "image"; data: string; mimeType: string }[] = [];

    for (const block of params.prompt) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "image") {
        images.push({ type: "image", data: block.data, mimeType: block.mimeType });
      } else if (block.type === "resource_link") {
        // Client wants us to read this resource — include the URI as a reference
        textParts.push(`\n[Resource: ${block.name}${block.title ? ` — ${block.title}` : ""}]\nURI: ${block.uri}${block.description ? `\nDescription: ${block.description}` : ""}`);
      } else if (block.type === "resource") {
        const resource = block.resource;
        if ("text" in resource) {
          // Inline text resource — embed directly
          textParts.push(`\n[Embedded Resource: ${resource.uri}]\n\`\`\`\n${resource.text}\n\`\`\``);
        } else if ("blob" in resource) {
          // Binary resource — if it's an image, include as image
          if (resource.mimeType?.startsWith("image/")) {
            images.push({ type: "image", data: resource.blob, mimeType: resource.mimeType });
          } else {
            textParts.push(`\n[Embedded Resource: ${resource.uri}]\n(Binary content, ${resource.mimeType ?? "unknown type"})`);
          }
        }
      }
    }
    const promptText = textParts.join("\n");

    if (!promptText.trim() && images.length === 0) {
      throw RequestError.invalidParams({}, "Prompt is empty");
    }

    acpLogger.info("Prompt received for session", params.sessionId, "text:", promptText.slice(0, 100), "images:", images.length);

    // Set active ACP connection for permission bridging
    setActiveAcpConnection(this.connection, params.sessionId);

    // Reset abort controller for this turn
    entry.abortController = new AbortController();

    // Subscribe to events and forward as ACP sessionUpdate notifications
    const unsubscribe = agentSession.subscribe((event: AgentSessionEvent) => {
      void this.handleSessionEvent(params.sessionId, event, entry.agentSession);
    });

    try {
      await agentSession.prompt(promptText, images.length > 0 ? { images } : undefined);
    } catch (err) {
      acpLogger.error("Prompt error:", err);
      unsubscribe();
      clearActiveAcpConnection();
      if (entry.abortController.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      throw err;
    }

    unsubscribe();
    clearActiveAcpConnection();

    if (entry.abortController.signal.aborted) {
      this.lastStopReasons.delete(params.sessionId);
      return { stopReason: "cancelled" };
    }

    const stopReason = this.lastStopReasons.get(params.sessionId) ?? "end_turn";
    this.lastStopReasons.delete(params.sessionId);
    return { stopReason };
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    const entry = sessionBridge.getSession(params.sessionId);
    if (!entry) return;

    entry.abortController.abort();
    await entry.agentSession.abort();
    acpLogger.info("Cancelled session", params.sessionId);
  }

  private async handleSessionEvent(
    sessionId: string,
    event: AgentSessionEvent,
    _agentSession: AgentSession
  ): Promise<void> {
    try {
      switch (event.type) {
        case "agent_start": {
          this.sentTextLengths.set(sessionId, 0);
          break;
        }

        case "message_update": {
          const msg = event.message;
          if (msg.role === "assistant") {
            // Check for stream-level errors
            if (event.assistantMessageEvent.type === "error" && msg.errorMessage) {
              await this.connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: `\n*(Error: ${msg.errorMessage})*` },
                },
              });
              break;
            }

            const fullText = msg.content
              .filter((c): c is PiTextContent => c.type === "text")
              .map((c) => c.text)
              .join("");
            const sentLen = this.sentTextLengths.get(sessionId) ?? 0;
            if (fullText.length > sentLen) {
              const delta = fullText.slice(sentLen);
              this.sentTextLengths.set(sessionId, fullText.length);
              await this.connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: delta },
                },
              });
            }

            // Stream thinking blocks as thought chunks
            for (const c of msg.content) {
              if (c.type === "thinking" && "thinking" in c && c.thinking) {
                await this.connection.sessionUpdate({
                  sessionId,
                  update: {
                    sessionUpdate: "agent_thought_chunk",
                    content: { type: "text", text: c.thinking },
                  },
                });
              }
            }
          }
          break;
        }

        case "tool_execution_start": {
          const locations = extractToolLocations(event.toolName, event.args);
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId: event.toolCallId,
              title: event.toolName,
              status: "pending",
              rawInput: event.args,
              kind: mapToolKind(event.toolName),
              locations,
            },
          });
          break;
        }

        case "tool_execution_update": {
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: event.toolCallId,
              status: "in_progress",
              rawOutput: event.partialResult,
            },
          });
          break;
        }

        case "tool_execution_end": {
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: event.toolCallId,
              status: event.isError ? "failed" : "completed",
              rawOutput: event.result,
            },
          });
          break;
        }

        case "agent_end": {
          this.sentTextLengths.delete(sessionId);
          // Determine stop reason from final messages
          const finalMsg = event.messages.find((m) => m.role === "assistant");
          if (finalMsg && finalMsg.role === "assistant") {
            this.lastStopReasons.set(sessionId, mapPiStopReasonToAcp(finalMsg.stopReason));
          }
          break;
        }

        case "turn_end": {
          if (event.message.role === "assistant") {
            this.lastStopReasons.set(sessionId, mapPiStopReasonToAcp(event.message.stopReason));
          }
          break;
        }

        case "compaction_start": {
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "*(compacting context...)*" },
            },
          });
          break;
        }

        case "compaction_end": {
          const status = event.aborted
            ? "*(compaction aborted)*"
            : event.errorMessage
              ? `*(compaction error: ${event.errorMessage})*`
              : "*(compaction complete)*";
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: status },
            },
          });
          break;
        }

        case "auto_retry_start": {
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `*(auto-retrying… attempt ${event.attempt}/${event.maxAttempts})*`,
              },
            },
          });
          break;
        }

        case "auto_retry_end": {
          const retryStatus = event.success
            ? "*(auto-retry succeeded)*"
            : `*(auto-retry failed after ${event.attempt} attempts${event.finalError ? ": " + event.finalError : ""})*`;
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: retryStatus },
            },
          });
          break;
        }

        case "session_info_changed": {
          await this.connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "session_info_update",
              title: event.name ?? null,
              updatedAt: new Date().toISOString(),
            },
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      acpLogger.error("Error handling session event:", err);
    }
  }

  /**
   * Replay conversation history as sessionUpdate notifications after loading/resuming a session.
   */
  private async replayHistory(sessionId: string, agentSession: AgentSession): Promise<void> {
    const messages = agentSession.messages;
    for (const msg of messages) {
      try {
        if (msg.role === "user") {
          const text =
            typeof msg.content === "string"
              ? msg.content
              : msg.content
                  .filter((c): c is PiTextContent => c.type === "text")
                  .map((c) => c.text)
                  .join("");
          if (text) {
            await this.connection.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text },
              },
            });
          }
        } else if (msg.role === "assistant") {
          const textContent = msg.content
            .filter((c): c is PiTextContent => c.type === "text")
            .map((c) => c.text)
            .join("");
          if (textContent) {
            await this.connection.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: textContent },
              },
            });
          }
        }
        // toolResult, bashExecution, custom messages are skipped in history replay
      } catch (err) {
        acpLogger.error("Error replaying history message:", err);
      }
    }
  }
}
