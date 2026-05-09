/**
 * Fork Modal — Conversation Branch View
 *
 * Displays only user and assistant messages from the session tree
 * as an indented, navigable list. Users can select a user message
 * to fork from that point in the conversation history.
 */

import { useEffect, useMemo, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { Task } from "../../agent/session-tasks.js";
import type { AgentMode } from "../../agent/mode.js";

type SessionManagerType = AgentSession["sessionManager"];
type SessionTreeNode = ReturnType<SessionManagerType["getTree"]>[number];

interface ForkModalProps {
  isActive: boolean;
  onClose: () => void;
  session: AgentSession | null;
  onFork: (entryId: string) => void;
  /** Current tasks to be included in fork */
  tasks?: Task[];
  /** Current agent mode */
  agentMode?: AgentMode;
  /** Current pending plan text (if any) */
  pendingPlanText?: string | null;
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

interface MessageEntry {
  type: "message";
  message: {
    role: string;
    content: unknown;
  };
}

/**
 * Type Guards
 *
 * isMessageEntry narrows the generic SessionTreeNode entry to a message-shaped object.
 * isVisibleNode filters the tree to only user/assistant messages (hides tool_results, compaction nodes, etc.).
 */

function isMessageEntry(entry: unknown): entry is MessageEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "type" in entry &&
    (entry as Record<string, unknown>)["type"] === "message" &&
    "message" in entry &&
    typeof (entry as Record<string, unknown>)["message"] === "object" &&
    (entry as Record<string, unknown>)["message"] !== null
  );
}

function isVisibleNode(node: SessionTreeNode): boolean {
  const entry = node.entry;
  if (!isMessageEntry(entry)) return false;
  return entry.message.role === "user";
}

function isUserMessageEntry(entry: unknown): boolean {
  return isMessageEntry(entry) && entry.message.role === "user";
}

/**
 * Text Extraction
 *
 * Pi messages may be plain strings or arrays of {type, text} blocks.
 * These helpers normalize both shapes into a single string for the tree view.
 */

function extractTextFromBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((block): block is { type: string; text?: string } =>
      typeof block === "object" && block !== null && "type" in block
    )
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

function extractUserText(content: unknown): string {
  return extractTextFromBlocks(content) || "(empty)";
}

function extractAssistantText(msg: { content: unknown }): string {
  const text = extractTextFromBlocks(msg.content);
  return text.slice(0, 50) || "(assistant)";
}

function formatEntry(node: SessionTreeNode): string {
  const entry = node.entry;
  if (!isMessageEntry(entry)) return "";

  const msg = entry.message;
  if (msg.role === "user") return extractUserText(msg.content);
  if (msg.role === "assistant") return extractAssistantText(msg as { content: unknown });
  return "";
}

/**
 * Tree Flattening
 *
 * Converts the recursive SessionTreeNode structure into a flat list of TreeRows.
 * Hidden nodes (tool results, compaction markers) are skipped but their children are promoted
 * to the same depth so the conversation flow stays visually continuous.
 */

function flattenTree(
  nodes: SessionTreeNode[],
  depth = 0,
  parentIsLast: boolean[] = [],
  result: TreeRow[] = []
): TreeRow[] {
  const visibleNodes = nodes.filter(isVisibleNode);
  let visibleIndex = 0;

  for (const node of nodes) {
    const isVisible = isVisibleNode(node);

    if (isVisible) {
      const isLast = visibleIndex === visibleNodes.length - 1;
      result.push({
        node,
        depth,
        index: result.length,
        isUserMessage: isUserMessageEntry(node.entry),
        displayText: formatEntry(node),
        isLast,
        parentIsLast: [...parentIsLast],
      });

      if (node.children.length > 0) {
        flattenTree(node.children, depth + 1, [...parentIsLast, isLast], result);
      }
      visibleIndex++;
    } else if (node.children.length > 0) {
      // Hidden nodes pass children through at same depth
      flattenTree(node.children, depth, [...parentIsLast], result);
    }
  }

  return result;
}

/**
 * Tree Prefix
 *
 * Builds the "│  └ " ASCII art prefix for each tree row based on depth and sibling position.
 * Deep trees are truncated with "…" so the rightmost branch structure remains visible.
 */

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
  if (prefix.length <= contentWidth) return prefix;
  return "…" + prefix.slice(-(contentWidth - 2));
}

/**
 * Default Selection
 *
 * When the modal opens, auto-selects the last user message on the current active branch
 * so the user can press Enter immediately without manual navigation.
 */

function findDefaultIndex(rows: TreeRow[], session: AgentSession): number {
  const selectable = rows.filter((r) => r.isUserMessage);
  if (selectable.length === 0) return 0;

  try {
    const branch = session.sessionManager.getBranch();
    const lastUserEntry = [...branch]
      .reverse()
      .find((e) => isUserMessageEntry(e));

    if (lastUserEntry) {
      const idx = selectable.findIndex((r) => r.node.entry.id === lastUserEntry.id);
      if (idx >= 0) return idx;
    }
  } catch {
    // ignore
  }

  return selectable.length - 1;
}

/**
 * ForkModal
 *
 * Interactive tree view of the conversation history.
 * Only user messages are selectable (Enter / mouse click) because forking
 * from an assistant node would cut off the user's original question.
 */

export function ForkModal({
  isActive,
  onClose,
  session,
  onFork,
  tasks = [],
  agentMode = "build",
  pendingPlanText,
}: ForkModalProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [rows, setRows] = useState<TreeRow[]>([]);

  // Has anything to preview?
  const hasPreview = tasks.length > 0 || agentMode !== "build" || pendingPlanText;

  // Calculate panel dimensions
  const panelWidth = Math.min(80, Math.max(52, Math.floor(width * 0.8)));
  // Reduced height to make room for preview panel
  const previewHeight = hasPreview ? 5 : 0;
  const listHeight = Math.min(16 - previewHeight, Math.floor(height * 0.5));
  const contentWidth = Math.max(1, panelWidth - 4);

  // Recompute tree rows when modal opens
  useEffect(() => {
    if (!isActive || !session) {
      setRows([]);
      return;
    }
    try {
      const tree = session.sessionManager.getTree();
      const newRows = flattenTree(tree);
      setRows(newRows);
      setSelectedIndex(findDefaultIndex(newRows, session));
    } catch {
      setRows([]);
      setSelectedIndex(0);
    }
  }, [isActive, session]);

  const selectableRows = useMemo(() => rows.filter((r) => r.isUserMessage), [rows]);

  const safeIndex = useMemo(() => {
    if (selectableRows.length === 0) return -1;
    return Math.max(0, Math.min(selectedIndex, selectableRows.length - 1));
  }, [selectedIndex, selectableRows.length]);

  const selectedRow = safeIndex >= 0 ? selectableRows[safeIndex] : null;

  // Keep selected row near the 5th visible line
  useEffect(() => {
    if (!selectedRow) {
      setScrollOffset(0);
      return;
    }
    const flatIndex = selectedRow.index;
    const maxOffset = Math.max(0, rows.length - listHeight);
    setScrollOffset(Math.max(0, Math.min(flatIndex - 4, maxOffset)));
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
      if (row) onFork(row.node.entry.id);
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
        alignSelf="center"
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

        {/* Fork Preview - shows what's being preserved */}
        {hasPreview && (
          <box
            paddingX={1}
            borderStyle="single"
            borderColor="#4a4a5a"
            flexDirection="column"
          >
            <text fg="#60a5fa" attributes={createTextAttributes({ bold: true })}>
              Will be preserved in fork:
            </text>
            <box flexDirection="row" gap={2}>
              {tasks.length > 0 && (
                <text fg="#50fa7b">
                  ✓ {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                </text>
              )}
              {agentMode !== "build" && (
                <text fg="#ff79c6">
                  ✓ Mode: {agentMode}
                </text>
              )}
              {pendingPlanText && (
                <text fg="#bd93f9">
                  ✓ Pending plan
                </text>
              )}
            </box>
          </box>
        )}

        {/* Tree list */}
        <box height={listHeight} flexDirection="column" overflow="hidden" marginTop={1}>
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
              ? isSelected ? "#ff79c6" : "#f8f8f2"
              : "#6c6c7c";

            return (
              <box
                key={`t-${row.node.entry.id}-${row.index}`}
                height={1}
                backgroundColor={isSelected ? "#44475a" : undefined}
                flexDirection="row"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  if (row.isUserMessage) onFork(row.node.entry.id);
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
