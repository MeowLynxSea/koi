/**
 * Chat Panel Component
 *
 * Renders the scrollable message history: user prompts, agent responses,
 * and markdown content.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Markdown, visibleWidth } from "@mariozechner/pi-tui";
import { markdownTheme } from "../theme.js";
import { SyntaxStyle } from "@opentui/core";

export interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

interface ChatPanelProps {
  messages: Message[];
  width?: number;
}

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

export function ChatPanel({ messages, width = 80 }: ChatPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(0);
  }, [messages.length]);

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

  const prefixFg = (role: string) => {
    switch (role) {
      case "user":
        return "#ff79c6";
      case "agent":
        return "#8b5cf6";
      case "system":
        return "#6c6c7c";
      default:
        return "white";
    }
  };

  const contentWidth = Math.max(1, (width ?? 80) - 2);
  const syntaxStyle = useMemo(() => SyntaxStyle.create(), []);

  // Render all messages into a flat list of lines for scrolling
  const allLines: { text: string; fg?: string }[] = [];
  for (const msg of messages) {
    if (allLines.length > 0) {
      allLines.push({ text: "" });
    }
    const prefix = prefixLabel(msg.role);
    const fg = prefixFg(msg.role);
    const prefixWidth = visibleWidth(prefix);

    if (msg.role === "agent" && msg.content.length > 0) {
      const md = new Markdown(msg.content, 0, 0, markdownTheme);
      const mdLines = md.render(Math.max(1, contentWidth - prefixWidth));
      if (mdLines.length > 0) {
        allLines.push({ text: prefix + mdLines[0]!, fg });
        for (let j = 1; j < mdLines.length; j++) {
          allLines.push({ text: mdLines[j]! });
        }
      }
    } else {
      const wrapped = wrapText(msg.content, contentWidth, prefixWidth);
      for (let j = 0; j < wrapped.length; j++) {
        if (j === 0) {
          allLines.push({ text: prefix + wrapped[j]!, fg });
        } else {
          allLines.push({ text: " ".repeat(prefixWidth) + wrapped[j]! });
        }
      }
    }
  }

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden" width={width}>
      {allLines.map((line, i) => (
        <text key={i} fg={line.fg}>
          {line.text}
        </text>
      ))}
    </box>
  );
}
