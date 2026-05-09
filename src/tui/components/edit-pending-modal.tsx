/**
 * Edit Pending Modal
 *
 * Modal for editing a queued/sheer message before it is delivered.
 * Contains an InputBox for multi-line editing.
 */

import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
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
  width = 70,
}: EditPendingModalProps) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (isActive) {
      setText(initialText);
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
        width={width}
      >
        <text alignSelf="center" attributes={createTextAttributes({ bold: true })} fg="#fbbf24">
          {label}
        </text>
        <box marginTop={1} marginBottom={1}>
          <InputBox
            value={text}
            onChange={setText}
            onSubmit={() => {
              if (text.trim()) {
                onConfirm(text.trim());
              }
            }}
            focused={true}
            disabled={false}
            width={width - 4}
          />
        </box>
        <box alignSelf="center" flexDirection="row" gap={2}>
          <box
            paddingX={2}
            backgroundColor="#2dd4bf"
            onMouseUp={() => {
              if (text.trim()) {
                onConfirm(text.trim());
              }
            }}
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
