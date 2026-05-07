/**
 * Command Panel Component
 *
 * A modal command palette with a single-line filter input and a scrollable
 * list of sectioned commands. Opened with Ctrl+P or "/" in empty prompt.
 * Closed with Ctrl+P, Esc, or clearing the input.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes, type KeyBinding } from "@opentui/core";
import type { KeyEvent, TextareaRenderable, MouseEvent } from "@opentui/core";

export interface CommandDef {
  id: string;
  label: string;
  section: string;
  action: () => void;
}

interface CommandPanelProps {
  isActive: boolean;
  onClose: () => void;
  commands: CommandDef[];
}

interface ListItem {
  type: "header" | "command";
  section?: string;
  cmd?: CommandDef;
  cmdIndex?: number;
}

export function CommandPanel({ isActive, onClose, commands }: CommandPanelProps) {
  const { width, height } = useTerminalDimensions();
  const inputRef = useRef<TextareaRenderable>(null);
  const [filterText, setFilterText] = useState("");
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const panelWidth = Math.min(70, Math.max(40, Math.floor(width * 0.7)));
  const listHeight = Math.min(12, Math.floor(height * 0.4));

  // Reset when opened
  useLayoutEffect(() => {
    if (isActive) {
      setFilterText("");
      setSelectedCmdIndex(0);
      setScrollOffset(0);
      const ta = inputRef.current;
      if (ta) {
        ta.editBuffer.replaceText("");
        ta.focus();
      }
    }
  }, [isActive]);

  // Build filtered flat list
  const query = filterText;
  const { flatItems, cmdCount } = useMemo(() => {
    let filtered = commands;
    if (query) {
      const q = query.toLowerCase();
      filtered = commands.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q) ||
          c.section.toLowerCase().includes(q)
      );
    }

    const grouped = new Map<string, CommandDef[]>();
    for (const cmd of filtered) {
      if (!grouped.has(cmd.section)) grouped.set(cmd.section, []);
      grouped.get(cmd.section)!.push(cmd);
    }

    const items: ListItem[] = [];
    let cmdIdx = 0;
    for (const [section, cmds] of grouped) {
      items.push({ type: "header", section });
      for (const cmd of cmds) {
        items.push({ type: "command", cmd, cmdIndex: cmdIdx });
        cmdIdx++;
      }
    }
    return { flatItems: items, cmdCount: cmdIdx };
  }, [commands, query]);

  // Clamp selected index
  useEffect(() => {
    if (selectedCmdIndex >= cmdCount && cmdCount > 0) {
      setSelectedCmdIndex(cmdCount - 1);
    }
  }, [cmdCount, selectedCmdIndex]);

  // Auto-scroll selected into view
  useEffect(() => {
    const selectedFlatIndex = flatItems.findIndex(
      (i) => i.type === "command" && i.cmdIndex === selectedCmdIndex
    );
    if (selectedFlatIndex === -1) return;
    if (selectedFlatIndex < scrollOffset) {
      setScrollOffset(selectedFlatIndex);
    } else if (selectedFlatIndex >= scrollOffset + listHeight) {
      setScrollOffset(selectedFlatIndex - listHeight + 1);
    }
  }, [selectedCmdIndex, flatItems, listHeight, scrollOffset]);

  // Global keyboard for navigation and close shortcuts
  useKeyboard((key) => {
    if (!isActive) return;
    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }
    if (key.name === "up") {
      key.preventDefault();
      key.stopPropagation();
      setSelectedCmdIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down") {
      key.preventDefault();
      key.stopPropagation();
      setSelectedCmdIndex((prev) => Math.max(0, Math.min(cmdCount - 1, prev + 1)));
      return;
    }
  });

  const handleContentChange = () => {
    const text = inputRef.current?.editBuffer.getText() ?? "";
    setFilterText(text);
    setSelectedCmdIndex(0);
    setScrollOffset(0);
  };

  const handleSubmit = () => {
    const selectedItem = flatItems.find(
      (i) => i.type === "command" && i.cmdIndex === selectedCmdIndex
    );
    if (selectedItem?.cmd) {
      onClose();
      selectedItem.cmd.action();
    }
  };

  const keyBindings = useMemo<KeyBinding[]>(
    () => [{ name: "return", action: "submit" }],
    []
  );

  if (!isActive) return null;

  const visibleItems = flatItems.slice(scrollOffset, scrollOffset + listHeight);

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
        width={panelWidth}
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={1}
        paddingY={1}
      >
        {/* Filter input */}
        <textarea
          ref={inputRef}
          initialValue=""
          focused={isActive}
          showCursor
          height={1}
          wrapMode="none"
          marginX={1}
          textColor="#f8f8f2"
          backgroundColor="#16213e"
          onContentChange={handleContentChange}
          onSubmit={handleSubmit}
          keyBindings={keyBindings}
        />

        {/* Separator */}
        <box height={1} marginTop={1}>
          <text fg="#4a4a5a">
            {"─".repeat(panelWidth - 2)}
          </text>
        </box>

        {/* Command list */}
        <box
          height={listHeight}
          flexDirection="column"
          overflow="hidden"
        >
          {visibleItems.map((item, idx) => {
            const flatIndex = scrollOffset + idx;
            if (item.type === "header") {
              return (
                <box key={`h-${item.section}-${flatIndex}`} height={1} marginTop={1}>
                  <text
                    fg="#ff79c6"
                    attributes={createTextAttributes({ bold: true })}
                  >
                    {item.section}
                  </text>
                </box>
              );
            }
            const isSelected = item.cmdIndex === selectedCmdIndex;
            return (
              <box
                key={`c-${item.cmd!.id}-${flatIndex}`}
                height={1}
                backgroundColor={isSelected ? "#44475a" : undefined}
                paddingLeft={2}
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  onClose();
                  item.cmd!.action();
                }}
              >
                <text fg={isSelected ? "#ff79c6" : "#f8f8f2"}>
                  {`${item.cmd!.id}  ${item.cmd!.label}`}
                </text>
              </box>
            );
          })}
          {flatItems.length === 0 && (
            <box height={1}>
              <text fg="#6c6c7c">No commands found</text>
            </box>
          )}
        </box>
      </box>
    </box>
  );
}
