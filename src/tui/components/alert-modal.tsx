/**
 * Alert Modal
 *
 * Simple alert dialog with a message and an OK button.
 * Used for displaying error messages and notifications.
 */

import { useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";

interface AlertModalProps {
  isActive: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

function Button({
  label,
  bgColor,
  hoverBgColor,
  isActive,
  onClick,
}: {
  label: string;
  bgColor: string;
  hoverBgColor: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const currentBg = hover ? hoverBgColor : bgColor;

  const handleMouseUp = (e: MouseEvent) => {
    if (isActive) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <box
      paddingX={2}
      paddingY={0}
      backgroundColor={currentBg}
      onMouseUp={handleMouseUp}
      onMouseOver={() => isActive && setHover(true)}
      onMouseOut={() => isActive && setHover(false)}
    >
      <text fg="white" attributes={createTextAttributes({ bold: true })}>
        {label}
      </text>
    </box>
  );
}

export function AlertModal({
  isActive,
  title,
  message,
  onClose,
}: AlertModalProps) {
  const { width } = useTerminalDimensions();

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "return" || key.name === "escape" || key.name === "o") {
      onClose();
    }
  });

  if (!isActive) return null;

  // Adaptive width based on message length
  const messageLines = message.split("\n");
  const maxLineLength = Math.max(...messageLines.map((l) => l.length));
  const modalWidth = Math.min(70, Math.max(40, Math.min(maxLineLength + 10, Math.floor(width * 0.7))));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="#00000090"
      alignItems="center"
      justifyContent="center"
    >
      <box
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        alignItems="center"
        width={modalWidth}
      >
        <text attributes={createTextAttributes({ bold: true })} fg="#fb7185">
          {title}
        </text>
        <box marginTop={1} flexDirection="column">
          {messageLines.map((line, i) => (
            <text key={i} fg="#f8f8f2" wrapMode="none">
              {line}
            </text>
          ))}
        </box>
        <box marginTop={2}>
          <Button
            label=" OK "
            bgColor="#2dd4bf"
            hoverBgColor="#5eead4"
            isActive={isActive}
            onClick={onClose}
          />
        </box>
        <text marginTop={1} fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
          Enter/O/ESC to close
        </text>
      </box>
    </box>
  );
}
