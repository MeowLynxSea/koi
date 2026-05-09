/**
 * Image Preview Modal
 *
 * Shows an image URL/path in a modal overlay with a coloured half-block
 * preview generated via jimp (pure JS, no external binaries).
 */

import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import { imageToHalfBlocks, type ImageRow } from "./image-utils.js";

interface ImagePreviewModalProps {
  isActive: boolean;
  url: string;
  onClose: () => void;
  terminalWidth: number;
  terminalHeight: number;
}

function ImagePreviewContent({ rows }: { rows: ImageRow[] }) {
  return (
    <box flexDirection="column">
      {rows.map((row, y) => (
        <text key={y}>
          {row.map((cell, x) => (
            <span key={x} fg={cell.fg} bg={cell.bg}>
              {"▄"}
            </span>
          ))}
        </text>
      ))}
    </box>
  );
}

export function ImagePreviewModal({
  isActive,
  url,
  onClose,
  terminalWidth,
  terminalHeight,
}: ImagePreviewModalProps) {
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape" || key.name === "q") {
      onClose();
    }
  });

  const modalW = Math.max(20, Math.floor(terminalWidth * 0.8));
  const modalH = Math.max(10, Math.floor(terminalHeight * 0.8));
  const imgMaxW = Math.max(10, modalW - 4);
  const imgMaxH = Math.max(4, modalH - 4);

  useEffect(() => {
    if (!isActive) {
      setRows(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPreview() {
      setLoading(true);
      try {
        const data = await imageToHalfBlocks(url, imgMaxW, imgMaxH);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [isActive, url, imgMaxW, imgMaxH]);

  if (!isActive) return null;

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
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        width={modalW}
        height={modalH}
      >
        {/* Header row */}
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <text fg="#8be9fd" attributes={createTextAttributes({ bold: true })}>
            Image Preview
          </text>
          <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
            Esc/Q
          </text>
        </box>

        {/* URL — single line, truncated if too long */}
        <text fg="#6c6c7c" wrapMode="none" truncate={true}>
          {url}
        </text>

        {/* Image area — centered both horizontally and vertically */}
        <box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
          {rows && <ImagePreviewContent rows={rows} />}
          {!rows && !loading && (
            <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
              Could not render image
            </text>
          )}
          {loading && (
            <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
              Loading...
            </text>
          )}
        </box>
      </box>
    </box>
  );
}
