/**
 * External Editor Modal
 *
 * A modal dialog for configuring the external editor path.
 * Used when the user types /editor or hasn't set an editor yet.
 */

import { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { TextareaRenderable } from "@opentui/core";

interface ExternalEditorModalProps {
  isActive: boolean;
  onClose: () => void;
  currentPath: string | null;
  onSave: (path: string) => void;
}

export function ExternalEditorModal({
  isActive,
  onClose,
  currentPath,
  onSave,
}: ExternalEditorModalProps) {
  const inputRef = useRef<TextareaRenderable>(null);
  const [editorPath, setEditorPath] = useState(currentPath ?? "");

  // Reset and focus when opened
  useEffect(() => {
    if (isActive) {
      setEditorPath(currentPath ?? "");
      setTimeout(() => {
        const ta = inputRef.current;
        if (ta) {
          ta.editBuffer.replaceText(currentPath ?? "");
          ta.focus();
        }
      }, 10);
    }
  }, [isActive, currentPath]);

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }

    if (key.name === "return") {
      key.preventDefault();
      key.stopPropagation();
      const path = editorPath.trim();
      if (path) {
        onSave(path);
      }
      return;
    }
  });

  const handleContentChange = () => {
    const text = inputRef.current?.editBuffer.getText() ?? "";
    setEditorPath(text);
  };

  if (!isActive) return null;

  const suggestedEditors = [
    { cmd: "code --wait", desc: "VS Code" },
    { cmd: "vim", desc: "Vim" },
    { cmd: "nano", desc: "Nano" },
    { cmd: "emacs", desc: "Emacs" },
    { cmd: "subl -w", desc: "Sublime Text" },
    { cmd: "hx", desc: "Helix" },
  ];

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
        width={60}
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
          External Editor Configuration
        </text>

        <box marginTop={1}>
          <text fg="#6c6c7c">
            Enter the command to launch your preferred editor.
          </text>
        </box>

        <box marginTop={1}>
          <text fg="#6c6c7c">
            The editor should wait for the file to be closed before returning.
          </text>
        </box>

        {/* Editor path input */}
        <box marginTop={1}>
          <text fg="#f8f8f2">Editor command:</text>
        </box>
        <box height={1} marginTop={1} backgroundColor="#16213e" paddingX={1}>
          <textarea
            ref={inputRef}
            initialValue=""
            focused={isActive}
            showCursor
            height={1}
            wrapMode="none"
            textColor="#f8f8f2"
            backgroundColor="#16213e"
            onContentChange={handleContentChange}
          />
        </box>

        {/* Suggested editors */}
        <box marginTop={1}>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Suggestions:
          </text>
        </box>
        {suggestedEditors.map((editor) => (
          <box key={editor.cmd} marginTop={0} flexDirection="row">
            <text fg="#50fa7b">{editor.cmd}</text>
            <text fg="#6c6c7c" marginLeft={2}>
              {editor.desc}
            </text>
          </box>
        ))}

        {/* Current setting */}
        {currentPath && (
          <box marginTop={1}>
            <text fg="#f1fa8c">Current: {currentPath}</text>
          </box>
        )}

        {/* Hints */}
        <box marginTop={2}>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Enter Confirm  Esc Cancel
          </text>
        </box>

        {/* Clear button */}
        {currentPath && (
          <box marginTop={1}>
            <text
              fg="#ff5555"
              onMouseUp={(e) => {
                e.stopPropagation();
                onSave("");
              }}
            >
              Click here to clear the editor setting
            </text>
          </box>
        )}
      </box>
    </box>
  );
}
