/**
 * Preference Modal
 *
 * Provides a settings panel for user preferences.
 * Currently supports toggling hook messages visibility in the UI.
 */

import { useState, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import { getShowHooksMessages, setShowHooksMessages } from "../../config/settings.js";

interface PreferenceModalProps {
  isActive: boolean;
  onClose: () => void;
  onShowHooksMessagesChange?: (show: boolean) => void;
}

interface ToggleItem {
  id: string;
  label: string;
  description: string;
  getValue: () => boolean;
  setValue: (value: boolean) => void;
}

export function PreferenceModal({ isActive, onClose, onShowHooksMessagesChange }: PreferenceModalProps) {
  const { width, height } = useTerminalDimensions();
  const [showHooksMessages, setShowHooksMessagesState] = useState(getShowHooksMessages());

  // Sync state with settings when modal opens
  useEffect(() => {
    if (isActive) {
      setShowHooksMessagesState(getShowHooksMessages());
    }
  }, [isActive]);

  const handleToggle = (value: boolean) => {
    setShowHooksMessagesState(value);
    setShowHooksMessages(value);
    onShowHooksMessagesChange?.(value);
  };

  const toggleItems: ToggleItem[] = [
    {
      id: "showHooksMessages",
      label: "Show Hook Messages",
      description: "Display hook execution messages in the chat panel",
      getValue: () => showHooksMessages,
      setValue: handleToggle,
    },
  ];

  const handleItemToggle = (item: ToggleItem, e: MouseEvent) => {
    e.stopPropagation();
    item.setValue(!item.getValue());
  };

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape") {
      onClose();
    }
  });

  if (!isActive) return null;

  const modalWidth = Math.min(70, Math.max(50, width - 10));
  const modalHeight = Math.max(10, height - 6);

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
      onMouseUp={(e: MouseEvent) => {
        e.stopPropagation();
        onClose();
      }}
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
        maxHeight={modalHeight}
        onMouseUp={(e: MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
          Preferences
        </text>

        {/* Separator */}
        <box height={1} marginTop={1}>
          <text fg="#4a4a5a">
            {"─".repeat(modalWidth - 4)}
          </text>
        </box>

        {/* Settings list */}
        <box flexDirection="column" gap={1} marginTop={1}>
          {toggleItems.map((item) => {
            const isEnabled = item.getValue();
            return (
              <box
                key={item.id}
                flexDirection="row"
                alignItems="center"
                justifyContent="space-between"
                paddingX={1}
                onMouseUp={(e: MouseEvent) => handleItemToggle(item, e)}
              >
                <box flexDirection="column">
                  <text fg="#f8f8f2" attributes={createTextAttributes({ bold: true })}>
                    {item.label}
                  </text>
                  <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                    {item.description}
                  </text>
                </box>
                <box
                  paddingX={1}
                  backgroundColor={isEnabled ? "#2dd4bf" : "#44475a"}
                >
                  <text fg="white" attributes={createTextAttributes({ bold: true })}>
                    {isEnabled ? "ON" : "OFF"}
                  </text>
                </box>
              </box>
            );
          })}
        </box>

        {/* Footer hint */}
        <box alignSelf="center" marginTop={2}>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Click toggle to change setting  •  Press Esc or click outside to close
          </text>
        </box>
      </box>
    </box>
  );
}
