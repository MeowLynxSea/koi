/**
 * Chat Panel Component
 *
 * Renders the scrollable message history.
 * Thinking blocks are attached to their parent agent message.
 */

import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from "react";
import { Markdown, visibleWidth } from "@mariozechner/pi-tui";
import { markdownTheme } from "../theme.js";
import { SyntaxStyle } from "@opentui/core";
import type { MouseEvent as OpenTUIMouseEvent } from "@opentui/core";

export type UIMessage =
  | { id: string; type: "user"; content: string }
  | {
      id: string;
      type: "agent";
      content: string;
      thinking?: string;
      thinkingCollapsed?: boolean;
    }
  | { id: string; type: "status"; content: string }
  | {
      id: string;
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      args: any;
      result?: any;
      isError?: boolean;
      collapsed: boolean;
    }
  | { id: string; type: "system"; content: string }
  | { id: string; type: "compaction"; content: string }
  | {
      id: string;
      type: "retry";
      attempt: number;
      maxAttempts: number;
      content: string;
    };

interface ChatPanelProps {
  messages: UIMessage[];
  width?: number;
  height?: number;
  onToggleCollapse?: (id: string) => void;
}

export interface ChatPanelHandle {
  scrollToBottom: () => void;
  scrollUp: () => void;
  scrollDown: () => void;
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

function summarizeToolCall(toolName: string, args: any): string {
  try {
    switch (toolName) {
      case "read":
        return `read: ${args.path ?? args.file ?? "?"}`;
      case "bash":
        return `bash: ${(args.command ?? "").slice(0, 40)}${(args.command ?? "").length > 40 ? "..." : ""}`;
      case "edit":
        return `edit: ${args.path ?? args.file ?? "?"}`;
      case "write":
        return `write: ${args.path ?? args.file ?? "?"}`;
      case "grep":
        return `grep: ${args.pattern ?? "?"}`;
      case "find":
        return `find: ${args.path ?? "."}`;
      case "ls":
        return `ls: ${args.path ?? "."}`;
      default:
        return `${toolName}: ${JSON.stringify(args).slice(0, 40)}`;
    }
  } catch {
    return `${toolName}: ...`;
  }
}

function padToWidth(text: string, width: number): string {
  const w = visibleWidth(text);
  if (w >= width) return text;
  return text + " ".repeat(Math.max(0, width - w));
}

function sanitizeLineAnsi(line: string): string {
  // Remove orphaned ANSI parameter fragments at line start
  // e.g. "42mwrite" -> "write", "38;5;250mtext" -> "text"
  line = line.replace(/^(?:\d+;)*\d+m/, "");

  // Ensure ANSI state is reset at end of line to prevent leakage
  if (line.includes("\x1b")) {
    const lastReset = line.lastIndexOf("\x1b[0m");
    const lastAnsi = line.lastIndexOf("\x1b[");
    if (lastAnsi > lastReset) {
      line += "\x1b[0m";
    }
  }

  return line;
}

function formatResult(result: any, isError?: boolean): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

interface Line {
  text: string;
  fg?: string;
  bg?: string;
  msgIdx: number;
  lineIdx: number;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, width = 80, height, onToggleCollapse }, ref) {
    const [scrollOffset, setScrollOffset] = useState(0);
    const panelHeight = Math.max(1, height ?? 10);

    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const syntaxStyle = useMemo(() => SyntaxStyle.create(), []);

    const compactLines = useMemo(() => {
      const allLines: Line[] = [];

      for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
        const msg = messages[msgIdx]!;
        let lineIdx = 0;
        const pushLine = (text: string, fg?: string, bg?: string) => {
          allLines.push({ text, fg, bg, msgIdx, lineIdx: lineIdx++ });
        };

        if (allLines.length > 0) {
          pushLine("");
        }

        switch (msg.type) {
          case "user": {
            const margin = "  ";
            const prefix = "> ";
            const prefixWidth = visibleWidth(prefix);
            const available = Math.max(1, contentWidth - 2 - prefixWidth);
            const wrapped = wrapText(msg.content, available, prefixWidth);
            for (let j = 0; j < wrapped.length; j++) {
              const raw =
                j === 0
                  ? margin + prefix + wrapped[j]!
                  : margin + " ".repeat(prefixWidth) + wrapped[j]!;
              pushLine(padToWidth(raw, contentWidth), undefined, "#333333");
            }
            break;
          }

          case "agent": {
            const margin = "  ";
            const prefix = "⏺ ";
            const prefixWidth = visibleWidth(prefix);
            const available = Math.max(1, contentWidth - 2 - prefixWidth);

            // Thinking block (rendered before content)
            if (msg.thinking) {
              if (msg.thinkingCollapsed) {
                pushLine(margin + `▼ Thinking... (ctrl+o to expand)`, "#6c6c7c");
              } else {
                pushLine(margin + `▶ Thinking:`, "#6c6c7c");
                const wrapped = wrapText(msg.thinking, available, 2);
                for (const line of wrapped) {
                  pushLine(margin + "  " + line, "#6c6c7c");
                }
              }
              // Blank line between thinking and content
              pushLine("");
            }

            // Agent content
            if (msg.content.length > 0) {
              const md = new Markdown(msg.content, 0, 0, markdownTheme);
              const mdLines = md.render(Math.max(1, available));
              if (mdLines.length > 0) {
                pushLine(sanitizeLineAnsi(margin + prefix + mdLines[0]!));
                for (let j = 1; j < mdLines.length; j++) {
                  pushLine(sanitizeLineAnsi(margin + mdLines[j]!));
                }
              }
            }
            break;
          }

          case "status": {
            pushLine("* " + msg.content, "#6c6c7c");
            break;
          }

          case "tool_call": {
            const margin = "  ";
            const summary = summarizeToolCall(msg.toolName, msg.args);
            if (msg.collapsed) {
              const errorMark = msg.isError ? " [error]" : "";
              pushLine(
                margin + `▼ ${summary}${errorMark} (ctrl+o to expand)`,
                msg.isError ? "#ff5555" : "#6c6c7c"
              );
            } else {
              pushLine(margin + `▶ ${msg.toolName}`, msg.isError ? "#ff5555" : "#6c6c7c");
              const argsText = JSON.stringify(msg.args, null, 2);
              const argsLines = wrapText(argsText, contentWidth, 2);
              for (const line of argsLines) {
                pushLine(margin + "  " + line, "#6c6c7c");
              }
              if (msg.result !== undefined) {
                pushLine(margin + "  ──", "#6c6c7c");
                const resultText = formatResult(msg.result, msg.isError);
                const resultLines = wrapText(resultText, contentWidth, 2);
                for (const line of resultLines) {
                  pushLine(
                    margin + "  " + line,
                    msg.isError ? "#ff5555" : "#6c6c7c"
                  );
                }
              }
            }
            break;
          }

          case "system": {
            const wrapped = wrapText(msg.content, contentWidth, 0);
            for (const line of wrapped) {
              pushLine(line, "#6c6c7c");
            }
            break;
          }

          case "compaction":
          case "retry": {
            pushLine(msg.content, "#6c6c7c");
            break;
          }
        }
      }

      // Compact consecutive empty lines from markdown rendering
      const compact: Line[] = [];
      for (const line of allLines) {
        const last = compact[compact.length - 1];
        if (line.text === "" && last !== undefined && last.text === "") {
          continue;
        }
        compact.push(line);
      }

      return compact;
    }, [messages, contentWidth, syntaxStyle]);

    const maxScroll = Math.max(0, compactLines.length - panelHeight);

    useEffect(() => {
      setScrollOffset(maxScroll);
    }, [messages.length, maxScroll]);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => setScrollOffset(maxScroll),
      scrollUp: () => setScrollOffset((prev) => Math.max(0, prev - 1)),
      scrollDown: () =>
        setScrollOffset((prev) => Math.min(maxScroll, prev + 1)),
    }));

    const startIdx = Math.min(scrollOffset, maxScroll);
    const visibleLines = compactLines.slice(startIdx, startIdx + panelHeight);

    const handleMouseScroll = (e: OpenTUIMouseEvent) => {
      if (e.scroll?.direction === "up") {
        setScrollOffset((prev) => Math.max(0, prev - 3));
      } else if (e.scroll?.direction === "down") {
        setScrollOffset((prev) => Math.min(maxScroll, prev + 3));
      }
    };

    return (
      <box
        flexGrow={1}
        height={panelHeight}
        flexDirection="column"
        overflow="hidden"
        width={width}
        onMouseScroll={handleMouseScroll}
      >
        {visibleLines.map((line) => (
          <text
            key={`msg-${line.msgIdx}-line-${line.lineIdx}-${line.text.slice(0, 20)}`}
            fg={line.fg}
            bg={line.bg}
          >
            {line.text}
          </text>
        ))}
      </box>
    );
  }
);
