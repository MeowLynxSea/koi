/**
 * Edit Pending Modal
 *
 * Modal for editing a queued/sheer message before it is delivered.
 * Contains an InputBox for multi-line editing.
 */

import { useRef, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes, type TextareaRenderable } from "@opentui/core";
import { InputBox } from "./input-box.js";

interface EditPendingModalProps {
  isActive: boolean;
  initialText: string;
  type: "sheer" | "queued";
  onConfirm: (text: string) => void;
  onCancel: () => void;
  width?: number;
}

export function EditPendingModal({
  isActive,
  initialText,
  type,
  onConfirm,
  onCancel,
  width: widthProp,
}: EditPendingModalProps) {
  const { width } = useTerminalDimensions();
  const textareaRef = useRef<TextareaRenderable | null>(null);

  useEffect(() => {
    if (isActive && textareaRef.current) {
      textareaRef.current.editBuffer.setText(initialText);
    }
  }, [isActive, initialText]);

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape") {
      onCancel();
    }
  });

  if (!isActive) return null;

  const label = type === "sheer" ? "Edit Sheer" : "Edit Queued";

  // Adaptive width
  const modalWidth = Math.min(widthProp ?? 70, Math.max(40, Math.floor(width * 0.85)));

  const handleConfirm = () => {
    const text = textareaRef.current?.editBuffer.getText() ?? "";
    if (text.trim()) {
      onConfirm(text.trim());
    }
  };

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
        flexDirection="column"
        alignSelf="center"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        width={modalWidth}
      >
        <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#fbbf24">
          {label}
        </text>
        <box marginTop={1} marginBottom={1}>
          <InputBox
            onSubmit={handleConfirm}
            focused={true}
            disabled={false}
            width={modalWidth - 4}
          />
        </box>
        <box alignSelf="center" flexDirection="row" gap={2}>
          <box
            paddingX={2}
            backgroundColor="#2dd4bf"
            onMouseUp={handleConfirm}
          >
            <text fg="white" attributes={createTextAttributes({ bold: true })}>Confirm</text>
          </box>
          <box paddingX={2} backgroundColor="#f43f5e" onMouseUp={onCancel}>
            <text fg="white" attributes={createTextAttributes({ bold: true })}>Cancel</text>
          </box>
        </box>
      </box>
    </box>
  );
}
