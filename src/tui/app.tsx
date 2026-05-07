/**
 * TUI Application
 *
 * Orchestrates the terminal UI using Ink: layout manager, focus management,
 * event routing, and the main render loop.
 */

import React, { useState, useCallback } from "react";
import { Box, useInput, useApp } from "ink";
import { MouseProvider } from "@ink-tools/ink-mouse";
import { ChatPanel, type Message } from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { ExitModal } from "./components/exit-modal.js";
import { useTerminalSize } from "./hooks/use-terminal-size.js";

const SIDEBAR_WIDTH = 28;

export function App() {
  const { exit } = useApp();
  const { columns: termWidth, rows: termHeight } = useTerminalSize();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showExitModal, setShowExitModal] = useState(false);

  const width = termWidth ?? 80;
  const height = termHeight ?? 24;
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
  useInput(
    (input, key) => {
      if (!showExitModal && key.ctrl && input === "c") {
        setShowExitModal(true);
      }
    },
    { isActive: true }
  );

  return (
    <MouseProvider>
      <Box width={width} height={height} flexDirection="column">
        {/* Main content layer */}
        <Box width={width} height={height} flexDirection="row">
          {/* Left column: chat + input + info bar */}
          <Box width={leftWidth} flexDirection="column">
            <ChatPanel messages={messages} width={leftWidth} />
            <InputBox
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSubmit}
              focused={!showExitModal}
              width={leftWidth}
            />
            <InfoBar width={leftWidth} exitMode={showExitModal} />
          </Box>

          {/* Divider + Sidebar */}
          <Box width={SIDEBAR_WIDTH + 2} flexDirection="row">
            <Box
              width={1}
              height={height}
              borderStyle="single"
              borderLeft
              borderRight={false}
              borderTop={false}
              borderBottom={false}
              borderColor="gray"
            />
            <Box width={1} />
            <SideBar width={SIDEBAR_WIDTH} workingDir={process.cwd()} />
          </Box>
        </Box>

        {/* Modal overlay layer — rendered on top using negative margin */}
        {showExitModal && (
          <Box
            marginTop={-height}
            width={width}
            height={height}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
          >
            {/* Dim background */}
            <Box
              position="absolute"
              width={width}
              height={height}
              backgroundColor="black"
            />
            <ExitModal
              isActive={showExitModal}
              onConfirm={() => exit()}
              onCancel={() => setShowExitModal(false)}
            />
          </Box>
        )}
      </Box>
    </MouseProvider>
  );
}
