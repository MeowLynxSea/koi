/**
 * CCE Initialization Modal
 *
 * Shows progress when auto-initializing Cat's Context Engine on app startup.
 * Auto-dismisses when initialization completes or fails.
 */

import { useState, useEffect } from "react";
import { createTextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { CceDownloadProgress } from "../../../cce/index.js";

interface CceInitModalProps {
  isActive: boolean;
  message: string;
  downloadProgress: CceDownloadProgress | null;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return <text fg="#60a5fa">{SPINNER_FRAMES[frame]}</text>;
}

function ProgressBar({ progress }: { progress: number }) {
  const width = 28;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  return (
    <text>
      <span fg="#22c55e">[</span>
      <span fg="#22c55e">{"█".repeat(filled)}</span>
      <span fg="#4b5563">{"░".repeat(empty)}</span>
      <span fg="#22c55e">]</span>
    </text>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function CceInitModal({ isActive, message, downloadProgress }: CceInitModalProps) {
  if (!isActive) return null;

  const { width, height } = useTerminalDimensions();
  const modalWidth = Math.min(60, Math.max(40, Math.floor(width * 0.7)));
  const modalHeight = Math.min(height - 4, downloadProgress && downloadProgress.total > 0 ? 14 : 10);

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
        borderColor="#60a5fa"
        backgroundColor="#1a1a2e"
        paddingX={3}
        paddingY={2}
        flexDirection="column"
        width={modalWidth}
        height={modalHeight}
      >
        {/* Header */}
        <box flexDirection="row" alignItems="center" justifyContent="center" marginBottom={1}>
          <Spinner />
          <text marginLeft={1} attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
            Initializing Cat's Context Engine
          </text>
        </box>

        {/* Current step */}
        <box flexDirection="row" alignItems="center" justifyContent="center" marginBottom={1}>
          <text fg="#e5e7eb">{message}</text>
        </box>

        {/* Download progress */}
        {downloadProgress && downloadProgress.total > 0 && (
          <box flexDirection="column" alignItems="center" marginBottom={1}>
            <text fg="#8be9fd" wrapMode="none">
              {downloadProgress.file}
            </text>
            <box flexDirection="row" alignItems="center" marginTop={1}>
              <ProgressBar progress={downloadProgress.progress} />
              <text marginLeft={1} fg="#60a5fa" attributes={createTextAttributes({ bold: true })}>
                {downloadProgress.progress.toFixed(1)}%
              </text>
            </box>
            <text fg="#9ca3af" wrapMode="none">
              {formatBytes(downloadProgress.loaded)} / {formatBytes(downloadProgress.total)} @ {formatBytes(downloadProgress.speed)}/s
            </text>
          </box>
        )}

        {/* Downloading without total known */}
        {downloadProgress && downloadProgress.total === 0 && downloadProgress.loaded > 0 && (
          <box flexDirection="column" alignItems="center" marginBottom={1}>
            <text fg="#8be9fd" wrapMode="none">
              {downloadProgress.file}
            </text>
            <text fg="#9ca3af" wrapMode="none">
              {formatBytes(downloadProgress.loaded)} @ {formatBytes(downloadProgress.speed)}/s
            </text>
          </box>
        )}

        {/* Please wait */}
        <box flexDirection="row" justifyContent="center" marginTop={1}>
          <text fg="#9ca3af">Please wait...</text>
        </box>
      </box>
    </box>
  );
}
