/**
 * Input Box Component
 *
 * Multiline text input with prefix and horizontal borders.
 * Uses OpenTUI <textarea> for editing logic.
 */

import { useRef, useMemo, useEffect } from "react";
import { createTextAttributes, type TextareaRenderable, type KeyBinding } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";

const PREFIX = "Agent > ";

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onQueueSubmit?: (value: string) => void;
  onSlashEmpty?: () => void;
  focused?: boolean;
  disabled?: boolean;
  width?: number;
}

function useInputActions(
  textareaRef: React.RefObject<TextareaRenderable | null>,
  value: string,
  onChange: (value: string) => void,
  onSubmit: (value: string) => void,
  onQueueSubmit?: (value: string) => void,
  onSlashEmpty?: () => void
) {
  const getText = () => textareaRef.current?.editBuffer.getText() ?? "";

  const handleContentChange = () => {
    const text = getText();
    if (text !== value) onChange(text);
  };

  const handleSubmit = () => {
    const text = getText();
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

  return { handleContentChange, handleSubmit, handleKeyDown };
}

export function InputBox({
  value,
  onChange,
  onSubmit,
  onQueueSubmit,
  onSlashEmpty,
  focused = true,
  disabled = false,
  width,
}: InputBoxProps) {
  const textareaRef = useRef<TextareaRenderable>(null);
  const { handleContentChange, handleSubmit, handleKeyDown } = useInputActions(
    textareaRef,
    value,
    onChange,
    onSubmit,
    onQueueSubmit,
    onSlashEmpty
  );

  // Sync external value changes into the textarea editBuffer
  // (e.g. when a pending message is retracted back into the input box)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const current = textarea.editBuffer.getText();
    if (current !== value) {
      textarea.editBuffer.replaceText(value);
    }
  }, [value]);

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
      borderColor={disabled ? "#333333" : "gray"}
      paddingX={1}
      overflow="hidden"
    >
      <box flexDirection="row" height={3}>
        <box marginRight={1} flexShrink={0}>
          <text fg="#ff79c6" attributes={createTextAttributes({ bold: true })}>
            {PREFIX}
          </text>
        </box>
        <box flexGrow={1} height={3}>
          <textarea
            ref={textareaRef}
            initialValue={value}
            focused={focused}
            showCursor={true}
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
