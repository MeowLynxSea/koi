/**
 * Info Bar Component
 *
 * Persistent footer line: scrolling keybinding hints on the left,
 * empty space on the right reserved for the koi pet.
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

const HINT_TEXT = "Ctrl+S Send  Ctrl+N New Session  Ctrl+Y Yank  Ctrl+P Paste  ↑↓ History  Esc Cancel";
const EXIT_TEXT = "Confirm exit in dialog";
const SCROLL_INTERVAL_MS = 300;
const MAX_HINT_WIDTH_RATIO = 0.6; // max 60% of width for hints

interface InfoBarProps {
  width?: number;
  exitMode?: boolean;
}

export function InfoBar({ width = 80, exitMode = false }: InfoBarProps) {
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

  return (
    <Box width={width} height={1}>
      <Text dimColor>{displayText}</Text>
    </Box>
  );
}
