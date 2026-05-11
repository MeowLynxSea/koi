/**
 * Rename Session Modal
 *
 * Prompts the user for a new session title.
 */

import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable } from "@opentui/core";

interface RenameModalProps {
  isActive: boolean;
  currentTitle: string;
  onConfirm: (newTitle: string) => void;
  onCancel: () => void;
}

export function RenameModal({ isActive, currentTitle, onConfirm, onCancel }: RenameModalProps) {
  const { width } = useTerminalDimensions();
  const inputRef = useRef<TextareaRenderable>(null);
  const [value, setValue] = useState(currentTitle);

  useEffect(() => {
    if (isActive) {
      setValue(currentTitle);
      setTimeout(() => {
        const ta = inputRef.current;
        if (ta) {
          ta.editBuffer.replaceText(currentTitle);
          ta.focus();
        }
      }, 10);
    }
  }, [isActive, currentTitle]);

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "return") {
      if (value.trim()) {
        onConfirm(value.trim());
      }
      return;
    }
  });

  const handleContentChange = () => {
    const text = inputRef.current?.editBuffer.getText() ?? "";
    setValue(text);
  };

  if (!isActive) return null;

  // Adaptive width
  const modalWidth = Math.min(50, Math.max(30, Math.floor(width * 0.6)));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="#00000080"
      alignItems="center"
      justifyContent="center"
    >
      <box
        width={modalWidth}
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
      >
        <text
          attributes={createTextAttributes({ bold: true })}
          fg="#ff79c6"
        >
          Rename Session
        </text>
        <box marginTop={1} height={1} backgroundColor="#16213e" paddingX={1}>
          <textarea
            ref={inputRef}
            initialValue={currentTitle}
            focused={isActive}
            showCursor
            height={1}
            wrapMode="none"
            textColor="#f8f8f2"
            backgroundColor="#16213e"
            onContentChange={handleContentChange}
          />
        </box>
        <box marginTop={1} flexDirection="row" gap={2}>
          <box
            paddingX={2}
            backgroundColor="#2dd4bf"
            onMouseUp={() => value.trim() && onConfirm(value.trim())}
          >
            <text attributes={createTextAttributes({ bold: true })} fg="white">
              Confirm
            </text>
          </box>
          <box
            paddingX={2}
            backgroundColor="#f43f5e"
            onMouseUp={onCancel}
          >
            <text attributes={createTextAttributes({ bold: true })} fg="white">
              Cancel
            </text>
          </box>
        </box>
      </box>
    </box>
  );
}
