/**
 * Info Bar Component
 *
 * Persistent footer line: scrolling keybinding hints on the left,
 * empty space on the right reserved for the koi pet.
 */

import { useState, useEffect, useRef } from "react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";

const HINT_TEXT =
  "Enter Send/Steer  Ctrl+Enter Queue  Shift+Enter Newline  Ctrl+P Command  Ctrl+O Expand/Collapse  Ctrl+C Clear/Abort/Exit";
const EXIT_TEXT = "Confirm exit in dialog";
const SCROLL_INTERVAL_MS = 300;
const MAX_HINT_WIDTH_RATIO = 0.6; // max 60% of width for hints
const YOLO_BUTTON_WIDTH = 6; // " YOLO " = 6 chars with padding

// Gray for disabled, rose red for enabled
const DISABLED_COLOR = "#4a4a5a";
const ENABLED_COLOR = "#ff6b9d";

interface InfoBarProps {
  width?: number;
  exitMode?: boolean;
  yoloMode?: boolean;
  onToggleYolo?: () => void;
}

export function InfoBar({ width = 80, exitMode = false, yoloMode = false, onToggleYolo }: InfoBarProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [scrollDirection, setScrollDirection] = useState(1);
  const lastWidthRef = useRef(width);

  useEffect(() => {
    lastWidthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (exitMode) return;
    const maxWidth = Math.floor(lastWidthRef.current * MAX_HINT_WIDTH_RATIO);
    const textWidth = HINT_TEXT.length;
    if (textWidth <= maxWidth) return;

    const timer = setInterval(() => {
      const maxOffset = textWidth - maxWidth;
      setScrollOffset((prev) => {
        const next = prev + scrollDirection;
        if (next >= maxOffset) {
          setScrollDirection(-1);
          return maxOffset;
        }
        if (next <= 0) {
          setScrollDirection(1);
          return 0;
        }
        return next;
      });
    }, SCROLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [exitMode, scrollDirection]);

  let displayText: string;
  if (exitMode) {
    displayText = EXIT_TEXT;
  } else {
    const maxHintWidth = Math.floor(width * MAX_HINT_WIDTH_RATIO);
    const textWidth = HINT_TEXT.length;
    if (textWidth <= maxHintWidth) {
      displayText = HINT_TEXT;
    } else {
      displayText = HINT_TEXT.slice(scrollOffset, scrollOffset + maxHintWidth);
    }
  }

  const yoloBg = yoloMode ? ENABLED_COLOR : DISABLED_COLOR;
  const yoloFg = yoloMode ? "#ffffff" : "#a0a0b0";

  return (
    <box width={width} height={1} flexDirection="row" alignItems="center">
      <box width={Math.max(1, width - YOLO_BUTTON_WIDTH - 1)}>
        <text attributes={createTextAttributes({ dim: true })}>{displayText}</text>
      </box>
      <box
        width={YOLO_BUTTON_WIDTH}
        backgroundColor={yoloBg}
        justifyContent="center"
        onMouseUp={(e: MouseEvent) => {
          e.stopPropagation();
          onToggleYolo?.();
        }}
      >
        <text
          fg={yoloFg}
          attributes={createTextAttributes({ bold: true })}
        >
          {" YOLO "}
        </text>
      </box>
    </box>
  );
}
