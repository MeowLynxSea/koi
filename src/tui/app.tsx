/**
 * TUI Application
 *
 * Orchestrates the terminal UI using OpenTUI React: layout manager,
 * event routing, and the main render loop.
 * Integrates with Pi AgentSession for LLM agent loop.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import { useDialog } from "@opentui-ui/dialog/react";
import { ChatPanel, type ChatPanelHandle, wrapText } from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { ExitModal } from "./components/exit-modal.js";
import { CommandPanel, type CommandDef } from "./components/command-panel.js";
import { RenameModal } from "./components/rename-modal.js";
import { ConnectModal } from "./components/connect-modal.js";
import { ModelModal } from "./components/model-modal.js";
import { getSessionTitle, setSessionTitle, getCurrentModel, setCurrentModel, getAuxiliaryModel, setAuxiliaryModel, resolvePiModel } from "../config/settings.js";
import { useKoiAgent } from "../agent/hooks.js";
import { subscribePermissions, getPermissionQueue, resolvePermission } from "../agent/permission-ui.js";

const SIDEBAR_WIDTH = 28;

interface AppProps {
  onExit: () => void;
}

export function App({ onExit }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [inputText, setInputText] = useState("");
  const [showExitModal, setShowExitModal] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [sessionTitle, setSessionTitleState] = useState(getSessionTitle);
  const [currentModel, setCurrentModelState] = useState(getCurrentModel);
  const [auxiliaryModel, setAuxiliaryModelState] = useState(getAuxiliaryModel);

  const dialog = useDialog();

  const {
    session,
    messages,
    isStreaming,
    isReady,
    error,
    prompt,
    abort,
    expandAll,
    collapseAll,
    clearMessages,
  } = useKoiAgent();

  // Permission modal handling
  const processingPermissionRef = useRef(false);
  useEffect(() => {
    const unsubscribe = subscribePermissions(async () => {
      if (processingPermissionRef.current) return;
      const queue = getPermissionQueue();
      if (queue.length === 0) return;

      const request = queue[0];
      if (!request) {
        processingPermissionRef.current = false;
        return;
      }
      processingPermissionRef.current = true;

      const allowed = await dialog.confirm({
        backdropColor: "#000000",
        backdropOpacity: "50%",
        closeOnEscape: true,
        unstyled: true,
        content: ({ resolve }) => {
          const contentWidth = Math.min(50, Math.max(20, width - 8));
          const toolLines = wrapText(`Tool: ${request.toolName}`, contentWidth, 0);
          const reasonLines = wrapText(`Reason: ${request.reason}`, contentWidth, 0);
          return (
            <box
              flexDirection="column"
              alignSelf="center"
              borderStyle="rounded"
              borderColor="#4a4a5a"
              backgroundColor="#1a1a2e"
              paddingX={2}
              paddingY={1}
              maxHeight={Math.max(10, height - 6)}
            >
              <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#fbbf24">
                Permission Request
              </text>
              <box flexDirection="column" gap={1}>
                {toolLines.map((line, i) => (
                  <text key={`t-${i}`} fg="#00f5ff">{line}</text>
                ))}
                {reasonLines.map((line, i) => (
                  <text key={`r-${i}`} fg="#ff79c6">{line}</text>
                ))}
              </box>
              <box alignSelf="center" marginTop={1} flexDirection="row" gap={2}>
                <box
                  paddingX={1}
                  backgroundColor="#2dd4bf"
                  onMouseUp={() => resolve(true)}
                >
                  <text fg="white" attributes={createTextAttributes({ bold: true })}>Allow</text>
                </box>
                <box
                  paddingX={1}
                  backgroundColor="#f43f5e"
                  onMouseUp={() => resolve(false)}
                >
                  <text fg="white" attributes={createTextAttributes({ bold: true })}>Deny</text>
                </box>
              </box>
            </box>
          );
        },
      });

      resolvePermission(request.id, !!allowed);
      processingPermissionRef.current = false;
    });

    return unsubscribe;
  }, [dialog]);

  const leftWidth = Math.max(1, width - SIDEBAR_WIDTH - 2);
  const chatPanelHeight = Math.max(1, height - (error ? 1 : 0) - 5 - 1);
  const chatPanelRef = useRef<ChatPanelHandle>(null);

  const anyModalOpen =
    showExitModal || showCommandPanel || showRenameModal || showConnectModal || showModelModal || processingPermissionRef.current;

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim() && isReady && !isStreaming) {
        prompt(text);
        setInputText("");
      }
    },
    [isReady, isStreaming, prompt]
  );

  const handleRename = useCallback((newTitle: string) => {
    setSessionTitle(newTitle);
    setSessionTitleState(newTitle);
    setShowRenameModal(false);
  }, []);

  const modelInfo = useMemo(() => {
    const model = currentModel;
    if (!model) {
      return { modelName: "Not configured", provider: "Use /model to select" };
    }
    return {
      modelName: model.modelId,
      provider: `via ${model.provider}`,
    };
  }, [currentModel]);

  const commands = useMemo<CommandDef[]>(
    () => [
      {
        id: "/new",
        label: "Start a new session",
        section: "会话",
        action: () => {
          session?.agent.reset();
          clearMessages();
          setInputText("");
          setSessionTitle("New Session");
          setSessionTitleState("New Session");
        },
      },
      {
        id: "/fork",
        label: "Fork current session",
        section: "会话",
        action: () => {
          // Session forking is managed by Pi SessionManager
          // TODO: implement fork UI via session manager
        },
      },
      {
        id: "/compact",
        label: "Compact current session",
        section: "会话",
        action: () => {
          session?.compact().catch(() => {});
        },
      },
      {
        id: "/rename",
        label: "Rename session",
        section: "会话",
        action: () => setShowRenameModal(true),
      },
      {
        id: "/connect",
        label: "Connect to a provider",
        section: "设置",
        action: () => setShowConnectModal(true),
      },
      {
        id: "/model",
        label: "Select a model",
        section: "设置",
        action: () => setShowModelModal(true),
      },
    ],
    [session, clearMessages]
  );

  // Global keyboard shortcuts
  useKeyboard((key) => {
    if (anyModalOpen) {
      return;
    }

    if (key.ctrl && key.name === "c") {
      if (isStreaming) {
        abort();
      } else {
        setShowExitModal(true);
      }
      return;
    }

    if (key.ctrl && key.name === "p") {
      setShowCommandPanel(true);
      return;
    }

    if (key.ctrl && key.name === "o") {
      // Toggle all collapsible blocks: if any expanded, collapse all; else expand all
      const hasExpanded = messages.some(
        (m) =>
          (m.type === "agent" && m.thinking && !m.thinkingCollapsed) ||
          (m.type === "tool_call" && !m.collapsed)
      );
      if (hasExpanded) {
        collapseAll();
      } else {
        expandAll();
      }
      return;
    }

    if (key.name === "pageup") {
      chatPanelRef.current?.scrollUp?.();
      return;
    }
    if (key.name === "pagedown") {
      chatPanelRef.current?.scrollDown?.();
      return;
    }
  });

  const handleSlashEmpty = useCallback(() => {
    setShowCommandPanel(true);
    setInputText("");
  }, []);

  const handleSelectPrimary = useCallback(
    (model: { provider: string; modelId: string }) => {
      setCurrentModelState(model);
      setCurrentModel(model);
      setShowModelModal(false);
      // Update AgentSession model if session is ready
      if (session) {
        const piModel = resolvePiModel(model);
        if (piModel) {
          session.setModel(piModel).catch(() => {});
        }
      }
    },
    [session]
  );

  const handleSelectAuxiliary = useCallback(
    (model: { provider: string; modelId: string }) => {
      setAuxiliaryModelState(model);
      setAuxiliaryModel(model);
      setShowModelModal(false);
    },
    []
  );

  return (
    <box width={width} height={height} flexDirection="column">
      {/* Main content layer */}
      <box width={width} height={height} flexDirection="row">
        {/* Left column: chat + input + info bar */}
        <box width={leftWidth} flexDirection="column">
          {error && (
            <box height={1}>
              <text fg="#ff5555">Error: {error}</text>
            </box>
          )}
          <ChatPanel ref={chatPanelRef} messages={messages} width={leftWidth} height={chatPanelHeight} isStreaming={isStreaming} />
          <InputBox
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            onSlashEmpty={handleSlashEmpty}
            focused={!anyModalOpen && !isStreaming}
            disabled={isStreaming || !isReady}
            width={leftWidth}
          />
          <InfoBar width={leftWidth} exitMode={showExitModal} />
        </box>

        {/* Divider + Sidebar */}
        <box width={SIDEBAR_WIDTH + 2} flexDirection="row">
          <box
            width={1}
            height={height}
            border={["left"]}
            borderStyle="single"
            borderColor="gray"
          />
          <box width={1} />
          <SideBar
            width={SIDEBAR_WIDTH}
            workingDir={process.cwd()}
            sessionTitle={sessionTitle}
            modelName={modelInfo.modelName}
            provider={modelInfo.provider}
          />
        </box>
      </box>

      {/* Modal overlay layer */}
      {showExitModal && (
        <ExitModal
          isActive={showExitModal}
          onConfirm={onExit}
          onCancel={() => setShowExitModal(false)}
        />
      )}

      <CommandPanel
        isActive={showCommandPanel}
        onClose={() => setShowCommandPanel(false)}
        commands={commands}
      />

      <RenameModal
        isActive={showRenameModal}
        currentTitle={sessionTitle}
        onConfirm={handleRename}
        onCancel={() => setShowRenameModal(false)}
      />

      <ConnectModal
        isActive={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />

      <ModelModal
        isActive={showModelModal}
        onClose={() => setShowModelModal(false)}
        onSelectPrimary={handleSelectPrimary}
        onSelectAuxiliary={handleSelectAuxiliary}
      />
    </box>
  );
}
