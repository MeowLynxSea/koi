# Koi ACP (Agent Client Protocol) Support

## Overview

Koi implements the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) v0.21.x, allowing any ACP-compatible client (VS Code, Zed, Cursor, etc.) to connect to Koi as a backend coding agent.

When started with `--acp`, Koi enters headless agent mode:
- No TUI is rendered
- Communication happens over stdio via JSON-RPC 2.0 (ndjson)
- All existing capabilities are exposed: tools, MCP integration, skills, CCE context engine

## Usage

```bash
# Start Koi in ACP mode
koi --acp
```

## Architecture

```
bin/koi --acp
  └─ src/main.tsx (routes to ACP mode)
      └─ src/acp/server.ts (stdio + AgentSideConnection)
          └─ src/acp/agent.ts (KoiAcpAgent implements ACP Agent interface)
              ├─ src/acp/session-bridge.ts (ACP session ↔ Koi AgentSession)
              ├─ src/acp/permission-bridge.ts (Koi permissions → ACP requestPermission)
              └─ src/agent/* (existing Koi core)
```

## Implemented ACP Methods

### Required
- `initialize` — Protocol negotiation and capability advertisement
- `authenticate` — No-op (no auth required)
- `newSession` — Create a new Koi session
- `prompt` — Send a user message, stream results via `session/update`
- `cancel` — Abort the current turn

### Session Management
- `loadSession` — Load a persisted session
- `listSessions` — List all persisted sessions
- `resumeSession` — Resume without replaying history
- `closeSession` — Close and free resources
- `setSessionMode` — Switch between build/ask/plan modes
- `setSessionConfigOption` — Change model and other settings

### Client → Agent Notifications (handled)
- `session/cancel` — Abort current operation

### Agent → Client Notifications (sent)
- `session/update` — Stream of:
  - `agent_message_chunk` — Incremental assistant text
  - `agent_thought_chunk` — Thinking/reasoning blocks
  - `tool_call` — Tool execution start
  - `tool_call_update` — Tool progress and completion
  - `current_mode_update` — Mode changes

## Event Mapping

| Pi SDK Event | ACP Notification |
|-------------|------------------|
| `agent_start` | — (resets text tracking) |
| `message_update` (text) | `agent_message_chunk` (incremental) |
| `message_update` (thinking) | `agent_thought_chunk` |
| `tool_execution_start` | `tool_call` |
| `tool_execution_update` | `tool_call_update` (in_progress) |
| `tool_execution_end` | `tool_call_update` (completed/failed) |
| `compaction_start` | `agent_message_chunk` (compacting hint) |
| `agent_end` | — (cleans up text tracking) |

## Permission Bridging

Koi's permission system (`src/agent/permission-ui.ts`) automatically detects ACP mode and delegates permission requests to the connected ACP client via `requestPermission`.

Options sent to client:
- `allow_once` — "Allow"
- `reject_once` — "Reject"

## Development Notes

### Adding New ACP Capabilities

1. Update `agentCapabilities` in `src/acp/agent.ts` `initialize()`
2. Implement the corresponding method on `KoiAcpAgent`
3. Update this documentation

### Testing

```bash
# Manual test with stdin
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | koi --acp
```

### Environment Variables

- `KOI_ACP_MODE=1` — Force ACP mode (set by `bin/koi --acp`)
- `KOI_ACP_LOG_LEVEL=debug` — Enable debug logging to stderr

## Known Limitations

- **MCP servers from Client**: ACP `newSession.mcpServers` is currently ignored; Koi uses its global MCP config (`~/.config/koi/mcp.json`)
- **File system delegation**: Not yet implemented; tools use local filesystem directly
- **Terminal delegation**: Not yet implemented; bash tool uses local process spawning
- **Image blocks**: Accepted but not all models support them
- **Resource/resource_link blocks**: Not yet processed
