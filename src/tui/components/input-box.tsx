/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses OpenTUI <textarea> for editing logic.
 */

import React, { useRef, useEffect } from "react";
import { createTextAttributes, type TextareaRenderable } from "@opentui/core";

const MODE_PREFIX = "Agent > ";

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  focused?: boolean;
  width?: number;
}

export function InputBox({ value, onChange, onSubmit, focused = true, width }: InputBoxProps) {
  const textareaRef = useRef<TextareaRenderable>(null);

  // Sync external value to textarea when it changes from outside
  useEffect(() => {
    const current = textareaRef.current?.editBuffer.getText() ?? "";
    if (value !== current) {
      textareaRef.current?.editBuffer.setText(value);
    }
  }, [value]);

  const handleContentChange = () => {
    const text = textareaRef.current?.editBuffer.getText() ?? "";
    if (text !== value) {
      onChange(text);
    }
  };

  const handleSubmit = () => {
    const text = textareaRef.current?.editBuffer.getText() ?? "";
    if (text.trim()) {
      onSubmit(text);
      textareaRef.current?.editBuffer.setText("");
    }
  };

  return (
    <box
      width={width}
      flexDirection="column"
      border={["top", "bottom"]}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <box flexDirection="row">
        <box marginRight={1} flexShrink={0}>
          <text fg="#ff79c6" attributes={createTextAttributes({ bold: true })}>
            {MODE_PREFIX}
          </text>
        </box>
        <box flexGrow={1}>
          <textarea
            ref={textareaRef}
            initialValue={value}
            focused={focused}
            showCursor
            onContentChange={handleContentChange}
            onSubmit={handleSubmit}
            keyBindings={[
              { name: "return", action: "submit" },
              { name: "return", shift: true, action: "newline" },
            ]}
          />
        </box>
      </box>
    </box>
  );
}
