/**
 * Session Selection Modal
 *
 * Secondary modal for browsing and switching between conversation sessions.
 * Lists all persisted sessions with metadata.
 */

import { useEffect, useMemo, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import type { SessionMeta } from "../../agent/session-store.js";

interface SessionModalProps {
  isActive: boolean;
  onClose: () => void;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onSelect: (sessionFile: string) => void;
  onNewSession: () => void;
  onDelete?: (sessionId: string) => void;
  keyboardDisabled?: boolean;
}

function formatRelativeTime(date: Date): string {
  // Handle invalid dates to prevent TextNodeRenderable errors
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return "unknown";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SessionModal({
  isActive,
  onClose,
  sessions,
  currentSessionId,
  onSelect,
  onNewSession,
  onDelete,
  keyboardDisabled,
}: SessionModalProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Memoize layout calculations
  const layout = useMemo(() => ({
    panelWidth: Math.min(70, Math.max(50, Math.floor(width * 0.7))),
    listHeight: Math.min(14, Math.max(3, Math.floor(height * 0.5))),
  }), [width, height]);

  // Reset when opened
  useEffect(() => {
    if (isActive) {
      setSelectedIndex(0);
      setScrollOffset(0);
    }
  }, [isActive]);

  // Ensure selected index is valid
  const safeIndex = useMemo(() => {
    if (sessions.length === 0) return -1;
    return Math.max(0, Math.min(selectedIndex, sessions.length - 1));
  }, [selectedIndex, sessions.length]);

  // Keep selected index valid when sessions change
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedIndex(0);
    } else {
      setSelectedIndex((prev) => Math.min(prev, sessions.length - 1));
    }
  }, [sessions.length]);

  // Auto-scroll selected into view
  useEffect(() => {
    if (safeIndex === -1) return;
    if (safeIndex < scrollOffset) {
      setScrollOffset(safeIndex);
    } else if (safeIndex >= scrollOffset + layout.listHeight) {
      setScrollOffset(safeIndex - layout.listHeight + 1);
    }
  }, [safeIndex, layout.listHeight, scrollOffset]);

  useKeyboard((key) => {
    if (!isActive || keyboardDisabled) return;

    if (key.name === "escape") {
      onClose();
      return;
    }
    if (key.name === "up") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((prev) => Math.max(0, Math.min(sessions.length - 1, prev + 1)));
      return;
    }
    if (key.name === "n") {
      onNewSession();
      return;
    }
    if (key.name === "return") {
      const s = sessions[safeIndex];
      if (s) {
        onSelect(s.filePath);
      }
      return;
    }
    if (key.name === "d") {
      const s = sessions[safeIndex];
      if (s && onDelete) {
        onDelete(s.id);
      }
      return;
    }
  });

  if (!isActive) return null;

  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + layout.listHeight);

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
        width={layout.panelWidth}
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <box flexDirection="row" justifyContent="space-between">
          <text attributes={createTextAttributes({ bold: true })} fg="#ff79c6">
            Sessions
          </text>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            {`${sessions.length} total`}
          </text>
        </box>

        {/* Session list */}
        <box
          height={layout.listHeight}
          flexDirection="column"
          overflow="hidden"
          marginTop={1}
        >
          {sessions.length === 0 && (
            <box height={1}>
              <text fg="#6c6c7c">No sessions found.</text>
            </box>
          )}
          {visibleSessions.map((s, idx) => {
            const flatIndex = scrollOffset + idx;
            const isSelected = flatIndex === safeIndex;
            const isCurrent = s.id === currentSessionId;

            // Ensure safe string values for rendering
            const safeTitle = s.title ?? "Untitled Session";
            const safeMessageCount = typeof s.messageCount === "number" ? s.messageCount : 0;
            const messageCountDisplay = safeMessageCount > 0 ? safeMessageCount.toString() : "0";
            const safeUpdatedAt =
              s.updatedAt instanceof Date && !isNaN(s.updatedAt.getTime())
                ? s.updatedAt
                : new Date();

            return (
              <box
                key={`s-${s.id}-${flatIndex}`}
                height={1}
                backgroundColor={isSelected ? "#44475a" : undefined}
                flexDirection="row"
                onMouseUp={(e: MouseEvent) => {
                  e.stopPropagation();
                  onSelect(s.filePath);
                }}
              >
                <text
                  fg={isSelected ? "#ff79c6" : isCurrent ? "#00f5ff" : "#f8f8f2"}
                  attributes={createTextAttributes({ bold: isCurrent })}
                  width={Math.max(1, layout.panelWidth - 24)}
                  truncate={true}
                >
                  {isCurrent ? "● " : "  "}
                  {safeTitle}
                </text>
                <box flexDirection="row" gap={1}>
                  <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
                    {messageCountDisplay}msg
                  </text>
                  <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })} width={8}>
                    {formatRelativeTime(safeUpdatedAt)}
                  </text>
                </box>
              </box>
            );
          })}
        </box>

        {/* Footer hints */}
        <box marginTop={1} flexDirection="row" justifyContent="space-between">
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            ↑↓ Navigate  Enter Switch  n New  d Delete
          </text>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Esc Close
          </text>
        </box>
      </box>
    </box>
  );
}
