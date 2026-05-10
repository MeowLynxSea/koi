/**
 * MCP Settings Component
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes, type TextareaRenderable } from "@opentui/core";
import type { McpServerConfig } from "../../../services/mcp/types.js";
import {
  getAllMcpConfigs,
  getMcpConfig,
  setMcpConfig,
  removeMcpConfig,
  isMcpServerDisabled,
  validateMcpConfig,
  loadMcpConfigs,
} from "../../../services/mcp/config.js";
import { connectMcpServer, disconnectMcpServer, toggleMcpServer, getMcpConnections } from "../../../services/mcp/connection-manager.js";

interface MCPSettingsProps {
  isActive: boolean;
  onClose: () => void;
  onMcpChange?: () => void;
}

type View = "list" | "add" | "edit";
type ServerType = "stdio" | "sse" | "http" | "ws";

export function MCPSettings({ isActive, onClose, onMcpChange }: MCPSettingsProps) {
  const { width } = useTerminalDimensions();
  const [view, setView] = useState<View>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [servers, setServers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<ServerType>("stdio");
  const [editCommand, setEditCommand] = useState("");
  const [editArgs, setEditArgs] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editHeaders, setEditHeaders] = useState("");

  // Textarea refs
  const nameRef = useRef<TextareaRenderable>(null);
  const commandRef = useRef<TextareaRenderable>(null);
  const argsRef = useRef<TextareaRenderable>(null);
  const urlRef = useRef<TextareaRenderable>(null);
  const headersRef = useRef<TextareaRenderable>(null);

  const panelWidth = Math.min(75, Math.max(50, Math.floor(width * 0.8)));

  const refreshServers = useCallback(() => {
    loadMcpConfigs();
    const configs = getAllMcpConfigs();
    setServers(Array.from(configs.keys()));
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (isActive) {
      refreshServers();
      setView("list");
      setMessage(null);
    }
  }, [isActive, refreshServers]);

  const getServerStatus = (name: string) => {
    const connection = getMcpConnections().get(name);
    if (connection) return connection.status;
    if (isMcpServerDisabled(name)) return "disabled";
    return "disconnected";
  };

  const getServerType = (name: string) => {
    const config = getMcpConfig(name);
    return config?.type ?? "unknown";
  };

  const handleConnect = async (name: string) => {
    setMessage(`Connecting to ${name}...`);
    const result = await connectMcpServer(name);
    setMessage(result.success ? `Connected to ${name}` : `Failed: ${result.error}`);
    refreshServers();
    onMcpChange?.();
  };

  const handleToggle = async (name: string) => {
    const connection = getMcpConnections().get(name);
    const status = connection?.status ?? "disconnected";

    if (status === "connected" || status === "failed") {
      await toggleMcpServer(name, false);
      setMessage(`Disabled ${name}`);
      refreshServers();
      onMcpChange?.();
    } else {
      await toggleMcpServer(name, true);
      setMessage(`Enabled ${name}`);
      refreshServers();
      onMcpChange?.();
    }
  };

  const handleDelete = (name: string) => {
    removeMcpConfig(name);
    disconnectMcpServer(name).catch(() => {});
    setMessage(`Removed ${name}`);
    refreshServers();
    onMcpChange?.();
  };

  const handleAddNew = () => {
    setEditName("");
    setEditType("stdio");
    setEditCommand("");
    setEditArgs("");
    setEditUrl("");
    setEditHeaders("");
    setView("add");
  };

  const handleEdit = (name: string) => {
    const config = getMcpConfig(name);
    if (!config) {
      setMessage(`Config not found for ${name}`);
      return;
    }

    setEditName(name);
    if (config.type === "stdio" && config.command) {
      setEditType("stdio");
      setEditCommand(config.command);
      setEditArgs(config.args?.join(" ") ?? "");
    } else {
      setEditType((config.type ?? "sse") as ServerType);
      setEditUrl(config.url ?? "");
      setEditHeaders(Object.entries(config.headers ?? {}).map(([k, v]) => `${k}:${v}`).join("\n"));
    }
    setView("edit");
  };

  const handleSave = () => {
    let config: McpServerConfig;

    if (editType === "stdio") {
      if (!editCommand.trim()) { setMessage("Command is required for stdio servers"); return; }
      config = { type: "stdio", command: editCommand.trim(), args: editArgs.trim() ? editArgs.trim().split(/\s+/) : [] };
    } else {
      if (!editUrl.trim()) { setMessage("URL is required for remote servers"); return; }
      const headers: Record<string, string> = {};
      for (const line of editHeaders.split("\n")) {
        const [key, ...valueParts] = line.split(":");
        if (key && valueParts.length > 0) headers[key.trim()] = valueParts.join(":").trim();
      }
      config = { type: editType, url: editUrl.trim(), headers: Object.keys(headers).length > 0 ? headers : undefined };
    }

    const nameToUse = editName.trim() || (editType === "stdio" ? editCommand.trim() : editUrl.trim());
    if (!nameToUse) { setMessage("Could not determine server name"); return; }

    const validation = validateMcpConfig(nameToUse, config);
    if (!validation.valid) { setMessage(validation.errors?.join(", ") ?? "Invalid config"); return; }

    if (view === "add" && getMcpConfig(nameToUse)) { setMessage(`Server '${nameToUse}' already exists`); return; }

    setMcpConfig(nameToUse, config, "user");
    setMessage(`Saved ${nameToUse} - connecting...`);
    setView("list");
    refreshServers();

    // Auto-connect after saving
    void (async () => {
      const result = await connectMcpServer(nameToUse);
      setMessage(result.success ? `Connected to ${nameToUse}` : `Saved but failed to connect: ${result.error}`);
      refreshServers();
      onMcpChange?.();
    })();
  };

  const handleBack = () => { setView("list"); setMessage(null); };

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "escape") {
      if (view !== "list") { handleBack(); } else { onClose(); }
      return;
    }

    if (view === "list") {
      if (key.name === "up") { setSelectedIndex(i => Math.max(0, i - 1)); return; }
      if (key.name === "down") { setSelectedIndex(i => Math.min(servers.length - 1, i + 1)); return; }
      if (key.name === "return") {
        const selectedServer = servers[selectedIndex];
        if (selectedServer) { handleEdit(selectedServer); }
        else if (servers.length === 0) { handleAddNew(); }
        return;
      }
      if (key.name === "n" || key.name === "N") { handleAddNew(); return; }
    }

    if (view === "edit" || view === "add") {
      if (key.name === "return") { handleSave(); return; }
    }
  });

  if (!isActive) return null;

  const statusColors: Record<string, string> = {
    connected: "#00ff99", failed: "#ff6b6b", disabled: "#fbbf24", disconnected: "#6c6c7c", pending: "#00d9ff",
  };

  const TYPE_BUTTON_ENABLED_BG = "#ff6b9d";
  const TYPE_BUTTON_DISABLED_BG = "#4a4a5a";

  // List View
  if (view === "list") {
    return (
      <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" alignItems="center" justifyContent="center">
        <box width={panelWidth} flexDirection="column" borderStyle="rounded" borderColor="#4a4a5a" backgroundColor="#1a1a2e" paddingX={2} paddingY={1}>
          <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">MCP Servers</text>

          <box flexDirection="column" flexGrow={1} overflow="hidden" marginTop={1}>
            {servers.length === 0 ? (
              <box height={1}><text fg="#6c6c7c">No MCP servers configured. Press N to add one.</text></box>
            ) : servers.map((name, index) => {
              const status = getServerStatus(name);
              const type = getServerType(name);
              const color = statusColors[status] ?? "#6c6c7c";
              const isSelected = index === selectedIndex;

              return (
                <box
                  key={name}
                  height={1}
                  backgroundColor={isSelected ? "#44475a" : undefined}
                  paddingLeft={2}
                  flexDirection="row"
                >
                  <text fg={color}>● </text>
                  <text width={20} fg={isSelected ? "#ff79c6" : "#f8f8f2"}>{name}</text>
                  <text width={8} fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>[{type}]</text>
                  <text fg={color}>{status}</text>
                  <box flexGrow={1} />
                  {(status === "disconnected" || status === "failed") ? (
                    <text fg="#2dd4bf" onMouseUp={() => void handleConnect(name)}>Connect</text>
                  ) : null}
                  <text fg="#fbbf24" marginLeft={1} onMouseUp={() => handleToggle(name)}>
                    {status === "disabled" ? "Enable" : "Disable"}
                  </text>
                  <text fg="#f43f5e" marginLeft={1} onMouseUp={() => handleDelete(name)}>Remove</text>
                </box>
              );
            })}
          </box>

          <box marginTop={1} flexDirection="row" justifyContent="space-between">
            <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>[N] Add  [Enter] Edit  [Esc] Close</text>
            {message ? <text fg="#fbbf24">{message}</text> : null}
          </box>
        </box>
      </box>
    );
  }

  // Edit/Add View
  return (
    <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="#00000080" alignItems="center" justifyContent="center">
      <box width={panelWidth} flexDirection="column" borderStyle="rounded" borderColor="#4a4a5a" backgroundColor="#1a1a2e" paddingX={2} paddingY={1}>
        <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
          {view === "add" ? "Add MCP Server" : `Edit: ${editName}`}
        </text>

        <box flexDirection="column" flexGrow={1} marginTop={1} gap={1}>
          {view === "add" && (
            <box height={1} flexDirection="row" alignItems="center">
              <text width={12} fg="#f8f8f2">Name:</text>
              <textarea
                ref={nameRef}
                initialValue={editName}
                height={1}
                width={30}
                onContentChange={() => {
                  const text = nameRef.current?.editBuffer.getText() ?? "";
                  setEditName(text);
                }}
              />
            </box>
          )}

          <box height={1} flexDirection="row" alignItems="center">
            <text width={12} fg="#f8f8f2">Type:</text>
            <box flexDirection="row" gap={1}>
              {(["stdio", "sse", "http", "ws"] as ServerType[]).map((t) => (
                <box
                  key={t}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={editType === t ? TYPE_BUTTON_ENABLED_BG : TYPE_BUTTON_DISABLED_BG}
                  onMouseUp={() => setEditType(t)}
                >
                  <text fg={editType === t ? "#ffffff" : "#a0a0b0"} attributes={createTextAttributes({ bold: true })}>
                    {t.toUpperCase()}
                  </text>
                </box>
              ))}
            </box>
          </box>

          {editType === "stdio" ? (
            <>
              <box height={1} flexDirection="row" alignItems="center">
                <text width={12} fg="#f8f8f2">Command:</text>
                <textarea
                  ref={commandRef}
                  initialValue={editCommand}
                  height={1}
                  width={40}
                  onContentChange={() => {
                    const text = commandRef.current?.editBuffer.getText() ?? "";
                    setEditCommand(text);
                  }}
                />
              </box>
              <box height={1} flexDirection="row" alignItems="center">
                <text width={12} fg="#f8f8f2">Args:</text>
                <textarea
                  ref={argsRef}
                  initialValue={editArgs}
                  height={1}
                  width={40}
                  onContentChange={() => {
                    const text = argsRef.current?.editBuffer.getText() ?? "";
                    setEditArgs(text);
                  }}
                />
              </box>
            </>
          ) : (
            <>
              <box height={1} flexDirection="row" alignItems="center">
                <text width={12} fg="#f8f8f2">URL:</text>
                <textarea
                  ref={urlRef}
                  initialValue={editUrl}
                  height={1}
                  width={50}
                  onContentChange={() => {
                    const text = urlRef.current?.editBuffer.getText() ?? "";
                    setEditUrl(text);
                  }}
                />
              </box>
              <box height={2} flexDirection="row" alignItems="flex-start">
                <text width={12} fg="#f8f8f2">Headers:</text>
                <textarea
                  ref={headersRef}
                  initialValue={editHeaders}
                  height={2}
                  width={50}
                  onContentChange={() => {
                    const text = headersRef.current?.editBuffer.getText() ?? "";
                    setEditHeaders(text);
                  }}
                />
              </box>
            </>
          )}
        </box>

        <box marginTop={1} flexDirection="row" justifyContent="space-between" alignItems="center">
          <box flexDirection="row" gap={2}>
            <box paddingX={2} backgroundColor="#2dd4bf" onMouseUp={handleSave}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>[Save]</text>
            </box>
            <box paddingX={2} backgroundColor="#f43f5e" onMouseUp={handleBack}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>[Cancel]</text>
            </box>
          </box>
          {message ? <text fg="#fbbf24">{message}</text> : null}
        </box>
      </box>
    </box>
  );
}
