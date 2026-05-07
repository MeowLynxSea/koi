/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses OpenTUI <textarea> for editing logic.
 */

import React, { useRef, useMemo } from "react";
import { createTextAttributes, type TextareaRenderable, type KeyBinding } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";

const MODE_PREFIX = "Agent > ";

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onSlashEmpty?: () => void;
  focused?: boolean;
  width?: number;
}

export function InputBox({ value, onChange, onSubmit, onSlashEmpty, focused = true, width }: InputBoxProps) {
  const textareaRef = useRef<TextareaRenderable>(null);

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
      textareaRef.current?.editBuffer.replaceText("");
    }
  };

  const handleKeyDown = (event: KeyEvent) => {
    if (event.name === "/" && value === "" && onSlashEmpty) {
      event.preventDefault();
      event.stopPropagation();
      onSlashEmpty();
    }
  };

  const keyBindings = useMemo<KeyBinding[]>(
    () => [
      { name: "return", action: "submit" },
      { name: "return", shift: true, action: "newline" },
    ],
    []
  );

  return (
    <box
      width={width}
      height={5}
      flexDirection="column"
      border={["top", "bottom"]}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      overflow="hidden"
    >
      <box flexDirection="row" height={3}>
        <box marginRight={1} flexShrink={0}>
          <text fg="#ff79c6" attributes={createTextAttributes({ bold: true })}>
            {MODE_PREFIX}
          </text>
        </box>
        <box flexGrow={1} height={3}>
          <textarea
            ref={textareaRef}
            initialValue={value}
            focused={focused}
            showCursor
            height={3}
            onContentChange={handleContentChange}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            keyBindings={keyBindings}
          />
        </box>
      </box>
    </box>
  );
}
