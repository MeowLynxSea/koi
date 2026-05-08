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
  onToggleCollapse?: (id: string) => void;
}

export interface ChatPanelHandle {
  scrollToBottom: () => void;
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

function formatResult(result: any, isError?: boolean): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, width = 80, onToggleCollapse }, ref) {
    const [scrollOffset, setScrollOffset] = useState(0);

    useEffect(() => {
      setScrollOffset(0);
    }, [messages.length]);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => setScrollOffset(0),
    }));

    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const syntaxStyle = useMemo(() => SyntaxStyle.create(), []);

    interface Line {
      text: string;
      fg?: string;
      bg?: string;
    }

    const allLines: Line[] = [];

    for (const msg of messages) {
      if (allLines.length > 0) {
        allLines.push({ text: "" });
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
            allLines.push({
              text: padToWidth(raw, contentWidth),
              bg: "#333333",
            });
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
              allLines.push({
                text: margin + `▼ Thinking... (ctrl+o to expand)`,
                fg: "#6c6c7c",
              });
            } else {
              allLines.push({
                text: margin + `▶ Thinking:`,
                fg: "#6c6c7c",
              });
              const wrapped = wrapText(msg.thinking, available, 2);
              for (const line of wrapped) {
                allLines.push({ text: margin + "  " + line, fg: "#6c6c7c" });
              }
            }
            // Blank line between thinking and content
            allLines.push({ text: "" });
          }

          // Agent content
          if (msg.content.length > 0) {
            const md = new Markdown(msg.content, 0, 0, markdownTheme);
            const mdLines = md.render(Math.max(1, available));
            if (mdLines.length > 0) {
              allLines.push({ text: margin + prefix + mdLines[0]! });
              for (let j = 1; j < mdLines.length; j++) {
                allLines.push({ text: margin + mdLines[j]! });
              }
            }
          }
          break;
        }

        case "status": {
          allLines.push({
            text: "* " + msg.content,
            fg: "#6c6c7c",
          });
          break;
        }

        case "tool_call": {
          const summary = summarizeToolCall(msg.toolName, msg.args);
          if (msg.collapsed) {
            const errorMark = msg.isError ? " [error]" : "";
            allLines.push({
              text: `▼ ${summary}${errorMark} (ctrl+o to expand)`,
              fg: msg.isError ? "#ff5555" : "#6c6c7c",
            });
          } else {
            allLines.push({
              text: `▶ ${msg.toolName}`,
              fg: msg.isError ? "#ff5555" : "#6c6c7c",
            });
            const argsText = JSON.stringify(msg.args, null, 2);
            const argsLines = wrapText(argsText, contentWidth, 2);
            for (const line of argsLines) {
              allLines.push({ text: "  " + line, fg: "#6c6c7c" });
            }
            if (msg.result !== undefined) {
              allLines.push({ text: "  ──", fg: "#6c6c7c" });
              const resultText = formatResult(msg.result, msg.isError);
              const resultLines = wrapText(resultText, contentWidth, 2);
              for (const line of resultLines) {
                allLines.push({
                  text: "  " + line,
                  fg: msg.isError ? "#ff5555" : "#6c6c7c",
                });
              }
            }
          }
          break;
        }

        case "system": {
          const wrapped = wrapText(msg.content, contentWidth, 0);
          for (const line of wrapped) {
            allLines.push({ text: line, fg: "#6c6c7c" });
          }
          break;
        }

        case "compaction":
        case "retry": {
          allLines.push({ text: msg.content, fg: "#6c6c7c" });
          break;
        }
      }
    }

    // Compact consecutive empty lines from markdown rendering
    const compactLines: Line[] = [];
    for (const line of allLines) {
      const last = compactLines[compactLines.length - 1];
      if (
        line.text === "" &&
        last !== undefined &&
        last.text === ""
      ) {
        continue;
      }
      compactLines.push(line);
    }

    return (
      <box flexGrow={1} flexDirection="column" overflow="hidden" width={width}>
        {compactLines.map((line, i) => (
          <text key={i} fg={line.fg} bg={line.bg}>
            {line.text}
          </text>
        ))}
      </box>
    );
  }
);
