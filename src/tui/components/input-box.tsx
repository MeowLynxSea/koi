/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses OpenTUI <textarea> for editing logic.
 */

import { useRef, useMemo, useState, useEffect } from "react";
import { createTextAttributes, type TextareaRenderable, type KeyBinding } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import type { AgentMode } from "../../agent/mode.js";

const MODE_PREFIX: Record<AgentMode, string> = {
  build: "Build > ",
  ask: "Ask > ",
  plan: "Plan > ",
};

const MODE_COLOR: Record<AgentMode, string> = {
  build: "#4ade80",
  ask: "#fbbf24",
  plan: "#60a5fa",
};

// Ink wave colors for busy state - subtle gray gradient animation
const INK_WAVE_COLORS = [
  "#666666",
  "#5a5a5a",
  "#4e4e4e",
  "#383838",
  "#2d2d2d",
  "#222222",
  "#171717",
];

interface InputBoxProps {
  onSubmit: (value: string) => void;
  onQueueSubmit?: (value: string) => void;
  onSlashEmpty?: () => void;
  focused?: boolean;
  disabled?: boolean;
  width?: number;
  mode?: AgentMode;
  isBusy?: boolean;
  onModeSwitch?: () => void;
}

export function InputBox({
  onSubmit,
  onQueueSubmit,
  onSlashEmpty,
  focused = true,
  disabled = false,
  width,
  mode = "build",
  isBusy = false,
  onModeSwitch,
}: InputBoxProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null);

  const getText = () => textareaRef.current?.editBuffer.getText() ?? "";

  const handleSubmit = () => {
    const text = getText();
    if (text.trim()) {
      onSubmit(text);
      textareaRef.current?.editBuffer.replaceText("");
    }
  };

  const handleKeyDown = (event: KeyEvent) => {
    if (event.name === "tab" && event.shift && onModeSwitch) {
      event.preventDefault();
      event.stopPropagation();
      onModeSwitch();
      return;
    }
    if (event.name === "/" && getText() === "" && onSlashEmpty) {
      event.preventDefault();
      event.stopPropagation();
      onSlashEmpty();
      return;
    }
    if (event.name === "return" && event.ctrl && onQueueSubmit) {
      event.preventDefault();
      event.stopPropagation();
      const text = getText();
      if (text.trim()) {
        onQueueSubmit(text);
        textareaRef.current?.editBuffer.replaceText("");
      }
    }
  };

  const keyBindings = useMemo<KeyBinding[]>(
    () => [
      { name: "return", action: "submit" },
      { name: "return", shift: true, action: "newline" },
    ],
    []
  );

  // Ink wave animation state
  const [waveFrame, setWaveFrame] = useState(0);

  // Animate ink wave effect when busy
  useEffect(() => {
    if (!isBusy) return;
    const interval = setInterval(() => {
      setWaveFrame((f) => (f + 1) % INK_WAVE_COLORS.length);
    }, 300);
    return () => clearInterval(interval);
  }, [isBusy]);

  // Determine border color based on state
  const getBorderColor = () => {
    if (disabled) return "#333333";
    if (isBusy) return INK_WAVE_COLORS[waveFrame];
    return "gray";
  };

  return (
    <box
      width={width}
      height={5}
      flexDirection="column"
      border={["top", "bottom"]}
      borderStyle="single"
      borderColor={getBorderColor()}
      paddingX={1}
      overflow="hidden"
    >
      <box flexDirection="row" height={3}>
        <box marginRight={1} flexShrink={0}>
          <text fg={MODE_COLOR[mode]} attributes={createTextAttributes({ bold: true })}>
            {MODE_PREFIX[mode]}
          </text>
        </box>
        <box flexGrow={1} height={3}>
          <textarea
            ref={textareaRef}
            focused={focused}
            showCursor={true}
            height={3}
            width={Math.max(1, (width ?? 80) - MODE_PREFIX[mode].length - 2)}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            keyBindings={keyBindings}
          />
        </box>
      </box>
    </box>
  );
}
