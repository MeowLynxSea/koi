/**
 * TUI Application
 *
 * Orchestrates the terminal UI using OpenTUI React: layout manager,
 * event routing, and the main render loop.
 */

import React, { useState, useCallback, useMemo } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { ChatPanel, type Message } from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { ExitModal } from "./components/exit-modal.js";
import { CommandPanel, type CommandDef } from "./components/command-panel.js";
import { RenameModal } from "./components/rename-modal.js";
import { ConnectModal } from "./components/connect-modal.js";
import { ModelModal } from "./components/model-modal.js";
import { getSessionTitle, setSessionTitle, getCurrentModel, getProviderModels } from "../config/settings.js";

const SIDEBAR_WIDTH = 28;

interface AppProps {
  onExit: () => void;
}

export function App({ onExit }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showExitModal, setShowExitModal] = useState(false);
  const [showCommandPanel, setShowCommandPanel] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [sessionTitle, setSessionTitleState] = useState(getSessionTitle);
  const [currentModel, setCurrentModelState] = useState(getCurrentModel);

  const leftWidth = Math.max(1, width - SIDEBAR_WIDTH - 2);

  const anyModalOpen = showExitModal || showCommandPanel || showRenameModal || showConnectModal || showModelModal;

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInputText("");
      }
    },
    []
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
    const models = getProviderModels(model.provider);
    const found = models.find((m) => m.id === model.modelId);
    return {
      modelName: found?.name || model.modelId,
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
          setMessages([]);
          setSessionTitle("New Session");
          setSessionTitleState("New Session");
        },
      },
      {
        id: "/compact",
        label: "Compact current session",
        section: "会话",
        action: () => {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: "Session compacted." },
          ]);
        },
      },
      {
        id: "/fork",
        label: "Fork current session",
        section: "会话",
        action: () => {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: "Session forked." },
          ]);
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
    []
  );

  // Ctrl+C shows exit confirmation modal, Ctrl+P opens command panel
  useKeyboard((key) => {
    if (anyModalOpen) {
      // Let individual modals handle their own close shortcuts
      return;
    }
    if (key.ctrl && key.name === "c") {
      setShowExitModal(true);
      return;
    }
    if (key.ctrl && key.name === "p") {
      setShowCommandPanel(true);
      return;
    }
  });

  const handleSlashEmpty = useCallback(() => {
    setShowCommandPanel(true);
    setInputText("");
  }, []);

  return (
    <box width={width} height={height} flexDirection="column">
      {/* Main content layer */}
      <box width={width} height={height} flexDirection="row">
        {/* Left column: chat + input + info bar */}
        <box width={leftWidth} flexDirection="column">
          <ChatPanel messages={messages} width={leftWidth} />
          <InputBox
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            onSlashEmpty={handleSlashEmpty}
            focused={!anyModalOpen}
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
        onSelect={(model) => setCurrentModelState(model)}
      />
    </box>
  );
}
