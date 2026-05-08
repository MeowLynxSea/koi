/**
 * Fork Modal — Conversation Branch View
 *
 * Displays only user and assistant messages from the session tree
 * as an indented, navigable list. Users can select a user message
 * to fork from that point in the conversation history.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

type SessionManagerType = AgentSession["sessionManager"];
type SessionTreeNode = ReturnType<SessionManagerType["getTree"]>[number];

interface ForkModalProps {
  isActive: boolean;
  onClose: () => void;
  session: AgentSession | null;
  onFork: (entryId: string) => void;
}

interface TreeRow {
  node: SessionTreeNode;
  depth: number;
  index: number;
  isUserMessage: boolean;
  displayText: string;
  isLast: boolean;
  parentIsLast: boolean[];
}

function isVisibleNode(node: SessionTreeNode): boolean {
  const entry = node.entry as any;
  return (
    entry.type === "message" &&
    entry.message &&
    (entry.message.role === "user" || entry.message.role === "assistant")
  );
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } => c?.type === "text")
      .map((c) => c.text)
      .join("");
  }
  return "";
}

function formatEntry(node: SessionTreeNode): string {
  const entry = node.entry as any;
  if (entry.type !== "message") return "";
  const msg = entry.message;
  if (msg.role === "user") {
    const text = extractUserText(msg.content);
    return text || "(empty)";
  }
  if (msg.role === "assistant") {
    let text = "";
    for (const block of msg.content) {
      if (block.type === "text") text += block.text;
    }
    return text.slice(0, 50) || "(assistant)";
  }
  return "";
}

function flattenTree(
  nodes: SessionTreeNode[],
  depth = 0,
  parentIsLast: boolean[] = [],
  result: TreeRow[] = []
): TreeRow[] {
  // Count visible siblings so we can compute isLast correctly
  const visibleNodes = nodes.filter(isVisibleNode);

  let visibleIndex = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isVisible = isVisibleNode(node);

    if (isVisible) {
      const isLast = visibleIndex === visibleNodes.length - 1;
      const isUserMessage = (node.entry as any).message?.role === "user";
      result.push({
        node,
        depth,
        index: result.length,
        isUserMessage,
        displayText: formatEntry(node),
        isLast,
        parentIsLast: [...parentIsLast],
      });

      if (node.children.length > 0) {
        flattenTree(node.children, depth + 1, [...parentIsLast, isLast], result);
      }
      visibleIndex++;
    } else {
      // Hidden node (toolResult, model_change, compaction, etc.):
      // pass its children through at the same depth so the conversation
      // flow stays continuous.
      if (node.children.length > 0) {
        flattenTree(node.children, depth, [...parentIsLast], result);
      }
    }
  }
  return result;
}

function treePrefix(depth: number, parentIsLast: boolean[], isLast: boolean): string {
  let prefix = "";
  for (let i = 0; i < depth; i++) {
    prefix += parentIsLast[i] ? " " : "│";
  }
  prefix += isLast ? "└ " : "├ ";
  return prefix;
}

function getVisiblePrefix(row: TreeRow, contentWidth: number): string {
  const prefix = treePrefix(row.depth, row.parentIsLast, row.isLast);
  if (prefix.length <= contentWidth) {
    return prefix;
  }
  // Emergency fallback for impossibly deep trees: keep the rightmost part
  // so local branch structure is still visible.
  return "…" + prefix.slice(-(contentWidth - 2));
}

export function ForkModal({
  isActive,
  onClose,
  session,
  onFork,
}: ForkModalProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [rows, setRows] = useState<TreeRow[]>([]);

  const panelWidth = Math.min(80, Math.max(52, Math.floor(width * 0.8)));
  const listHeight = Math.min(16, Math.floor(height * 0.55));
  const contentWidth = Math.max(1, panelWidth - 4);

  // Recompute tree rows every time the modal opens so new messages are visible
  useEffect(() => {
    if (!isActive || !session) {
      setRows([]);
      return;
    }
    try {
      const tree = session.sessionManager.getTree();
      const newRows = flattenTree(tree);
      setRows(newRows);

      // Default to the last user message on the current active branch
      const branch = session.sessionManager.getBranch();
      const lastUserEntry = [...branch]
        .reverse()
        .find((e: any) => e.type === "message" && e.message?.role === "user");

      const selectable = newRows.filter((r) => r.isUserMessage);
      let defaultIndex = 0;
      if (lastUserEntry) {
        const idx = selectable.findIndex((r) => r.node.entry.id === lastUserEntry.id);
        if (idx >= 0) defaultIndex = idx;
      } else if (selectable.length > 0) {
        defaultIndex = selectable.length - 1;
      }
      setSelectedIndex(defaultIndex);
    } catch {
      setRows([]);
      setSelectedIndex(0);
    }
  }, [isActive, session]);

  const selectableRows = useMemo(() => {
    return rows.filter((r) => r.isUserMessage);
  }, [rows]);

  // Ensure selected index is valid (only among selectable rows)
  const safeIndex = useMemo(() => {
    if (selectableRows.length === 0) return -1;
    return Math.max(0, Math.min(selectedIndex, selectableRows.length - 1));
  }, [selectedIndex, selectableRows.length]);

  const selectedRow = safeIndex >= 0 ? selectableRows[safeIndex] : null;

  // Always keep the selected row near the 5th visible line (top-biased)
  useEffect(() => {
    if (!selectedRow) {
      setScrollOffset(0);
      return;
    }
    const flatIndex = selectedRow.index;
    const maxOffset = Math.max(0, rows.length - listHeight);
    const targetOffset = Math.max(0, Math.min(flatIndex - 4, maxOffset));
    setScrollOffset(targetOffset);
  }, [selectedRow, listHeight, rows.length]);

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "escape") {
      onClose();
      return;
    }
    if (key.name === "up") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((prev) => Math.max(0, Math.min(selectableRows.length - 1, prev + 1)));
      return;
    }
    if (key.name === "return") {
      const row = selectableRows[safeIndex];
      if (row) {
        onFork(row.node.entry.id);
      }
      return;
    }
  });

  if (!isActive) return null;

  const visibleRows = rows.slice(scrollOffset, scrollOffset + listHeight);

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
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
          Fork Session
        </text>
        <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })} marginTop={1}>
          Select a user message to branch from:
        </text>

        {/* Tree list */}
        <box
          height={listHeight}
          flexDirection="column"
          overflow="hidden"
          marginTop={1}
        >
          {rows.length === 0 && (
            <box height={1}>
              <text fg="#6c6c7c">No messages available.</text>
            </box>
          )}
          {visibleRows.map((row) => {
            const isSelected = selectedRow?.index === row.index;
            const prefix = getVisiblePrefix(row, contentWidth);
            const availableWidth = Math.max(1, contentWidth - prefix.length);
            const displayText =
              row.displayText.length > availableWidth
                ? row.displayText.slice(0, availableWidth - 1) + "…"
                : row.displayText;

            const fgColor = row.isUserMessage
              ? isSelected
                ? "#ff79c6"
                : "#f8f8f2"
              : "#6c6c7c";

            return (
              <box
                key={`t-${row.node.entry.id}-${row.index}`}
                height={1}
                backgroundColor={isSelected ? "#44475a" : undefined}
                flexDirection="row"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  if (row.isUserMessage) {
                    onFork(row.node.entry.id);
                  }
                }}
              >
                <text fg={fgColor} attributes={createTextAttributes({ dim: !row.isUserMessage })}>
                  {prefix}{displayText}
                </text>
              </box>
            );
          })}
        </box>

        {/* Footer hints */}
        <box marginTop={1} flexDirection="row" justifyContent="space-between">
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            ↑↓ Navigate  Enter Fork
          </text>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Esc Close
          </text>
        </box>
      </box>
    </box>
  );
}
