/**
 * TUI Application
 *
 * Orchestrates the terminal UI using OpenTUI React: layout manager,
 * event routing, and the main render loop.
 */

import React, { useState, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { ChatPanel, type Message } from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { ExitModal } from "./components/exit-modal.js";

const SIDEBAR_WIDTH = 28;

interface AppProps {
  onExit: () => void;
}

export function App({ onExit }: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showExitModal, setShowExitModal] = useState(false);

  const leftWidth = Math.max(1, width - SIDEBAR_WIDTH - 2);

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setInputText("");
      }
    },
    []
  );

  // Ctrl+C shows exit confirmation modal
  useKeyboard(
    (key) => {
      if (!showExitModal && key.ctrl && key.name === "c") {
        setShowExitModal(true);
      }
    }
  );

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
            focused={!showExitModal}
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
          <SideBar width={SIDEBAR_WIDTH} workingDir={process.cwd()} />
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
    </box>
  );
}
