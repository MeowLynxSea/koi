/**
 * Chat Panel Component
 *
 * Renders the scrollable message history: user prompts, agent responses,
 * and markdown content.
 */

import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { Markdown, visibleWidth } from "@mariozechner/pi-tui";
import { markdownTheme } from "../theme.js";
import chalk from "chalk";

export interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

interface ChatPanelProps {
  messages: Message[];
  width?: number;
}

export function ChatPanel({ messages, width = 80 }: ChatPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<{ height: number } | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(0);
  }, [messages.length]);

function wrapText(text: string, width: number, indent: number): string[] {
  const available = Math.max(1, width - indent);
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const seg of segmenter.segment(text)) {
    const g = seg.segment;
    const w = visibleWidth(g);
    if (g === "\n") {
      lines.push(current);
      current = "";
      currentWidth = 0;
      continue;
    }
    if (currentWidth + w > available && currentWidth > 0) {
      lines.push(current);
      current = g;
      currentWidth = w;
    } else {
      current += g;
      currentWidth += w;
    }
  }
  if (current.length > 0 || lines.length === 0) {
    lines.push(current);
  }
  return lines;
}

  const prefixColorFn = (role: string) => {
    switch (role) {
      case "user":
        return chalk.hex("#ff79c6");
      case "agent":
        return chalk.hex("#8b5cf6");
      case "system":
        return chalk.hex("#6c6c7c");
      default:
        return chalk.white;
    }
  };

  const prefixLabel = (role: string) => {
    switch (role) {
      case "user":
        return "You: ";
      case "agent":
        return "Agent: ";
      case "system":
        return "System: ";
      default:
        return "";
    }
  };

  const contentWidth = Math.max(1, (width ?? 80) - 2);

  // Render all messages into a flat list of lines for scrolling
  const allLines: string[] = [];
  for (const msg of messages) {
    if (allLines.length > 0) {
      allLines.push("");
    }
    const prefix = prefixLabel(msg.role);
    const prefixColor = prefixColorFn(msg.role);
    const reset = "\x1b[0m";
    const prefixWidth = visibleWidth(prefix);

    if (msg.role === "agent" && msg.content.length > 0) {
      const md = new Markdown(msg.content, 0, 0, markdownTheme);
      const mdLines = md.render(Math.max(1, contentWidth - prefixWidth));
      if (mdLines.length > 0) {
        const first = prefixColor(prefix) + reset + mdLines[0];
        allLines.push(first);
        for (let j = 1; j < mdLines.length; j++) {
          allLines.push(mdLines[j]!);
        }
      }
    } else {
      const wrapped = wrapText(msg.content, contentWidth, prefixWidth);
      for (let j = 0; j < wrapped.length; j++) {
        if (j === 0) {
          allLines.push(prefixColor(prefix) + reset + wrapped[j]!);
        } else {
          allLines.push(" ".repeat(prefixWidth) + wrapped[j]!);
        }
      }
    }
  }

  return (
    <Box flexGrow={1} flexDirection="column" overflow="hidden" width={width}>
      {allLines.map((line, i) => (
        <Text key={i} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}
