/**
 * Connecting Modal
 *
 * Modal dialog showing MCP connection progress with spinner animation.
 * Cannot be closed manually - auto-dismisses when all connections complete.
 */

import { useState, useEffect } from "react";
import { createTextAttributes } from "@opentui/core";
type SpinnerVariant = "dots" | "arc" | "circle" | "line";
import type { McpConnectionProgress } from "../../services/mcp/index.js";

interface ConnectingModalProps {
  isActive: boolean;
  progress: McpConnectionProgress | null;
}

// Spinner frames for loading animation
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner({ variant = "dots" }: { variant?: SpinnerVariant }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!variant || variant === "dots") {
      const interval = setInterval(() => {
        setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      }, 80);
      return () => clearInterval(interval);
    }
  }, [variant]);

  // For line spinner
  if (variant === "line") {
    return <text fg="#60a5fa">{">".repeat((frame % 4) + 1)}</text>;
  }

  return <text fg="#60a5fa">{SPINNER_FRAMES[frame]}</text>;
}

function StatusIcon({ status }: { status: "connecting" | "connected" | "failed" | "disabled" }) {
  switch (status) {
    case "connecting":
      return <text fg="#fbbf24">◐</text>;
    case "connected":
      return <text fg="#34d399">✓</text>;
    case "failed":
      return <text fg="#f87171">✗</text>;
    case "disabled":
      return <text fg="#9ca3af">○</text>;
  }
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const width = 30;
  const filled = Math.round((completed / total) * width);
  const empty = width - filled;
  
  // Use a single text with styled spans instead of nested text components
  return (
    <text>
      <span fg="#22c55e">[</span>
      <span fg="#22c55e">{"=".repeat(filled)}</span>
      <span fg="#4b5563">{"·".repeat(empty)}</span>
      <span fg="#22c55e">]</span>
    </text>
  );
}

export function ConnectingModal({ isActive, progress }: ConnectingModalProps) {
  // Don't render if not active or progress is null
  if (!isActive) return null;

  const defaultProgress: McpConnectionProgress = progress ?? {
    total: 0,
    completed: 0,
    currentServer: "Initializing...",
    status: "connecting",
  };

  const { total, completed, currentServer, status, error } = defaultProgress;
  const isComplete = completed >= total && total > 0;

  // Format percentage
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="#00000090"
      alignItems="center"
      justifyContent="center"
    >
      <box
        borderStyle="rounded"
        borderColor={isComplete ? (status === "failed" ? "#f87171" : "#34d399") : "#60a5fa"}
        backgroundColor="#1a1a2e"
        paddingX={3}
        paddingY={2}
        flexDirection="column"
        minWidth={50}
        maxWidth={60}
      >
        {/* Header */}
        <box flexDirection="row" alignItems="center" justifyContent="center" marginBottom={1}>
          <Spinner variant="dots" />
          <text marginLeft={1} attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
            Connecting MCP Servers
          </text>
        </box>

        {/* Progress info */}
        <box flexDirection="column" alignItems="center" marginBottom={1}>
          <text fg="#9ca3af">
            {completed} / {total} servers
          </text>
          <ProgressBar completed={completed} total={total} />
          <text fg="#60a5fa" attributes={createTextAttributes({ bold: true })}>
            {percentage}%
          </text>
        </box>

        {/* Current server being processed */}
        <box flexDirection="row" alignItems="center" marginBottom={1}>
          <StatusIcon status={status} />
          <text marginLeft={1} fg="#e5e7eb">
            {currentServer}
          </text>
        </box>

        {/* Error message if any */}
        {error && (
          <box flexDirection="column" marginTop={1}>
            <text fg="#f87171" attributes={createTextAttributes({ bold: true })}>
              Error:
            </text>
            <text fg="#fca5a5" marginLeft={1}>
              {error}
            </text>
          </box>
        )}

        {/* Status message */}
        <box flexDirection="row" justifyContent="center" marginTop={1}>
          {isComplete ? (
            status === "failed" ? (
              <text fg="#fbbf24">
                Connection failed. Check settings with /mcp
              </text>
            ) : (
              <text fg="#34d399">
                All servers connected!
              </text>
            )
          ) : (
            <text fg="#9ca3af">
              Please wait...
            </text>
          )}
        </box>
      </box>
    </box>
  );
}
