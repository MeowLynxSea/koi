/**
 * Chat Panel Component
 *
 * Renders the scrollable message history using OpenTUI native components.
 */

import React, { useMemo, useImperativeHandle, forwardRef, useRef } from "react";
import stringWidth from "string-width";
import { SyntaxStyle, type ScrollBoxRenderable } from "@opentui/core";

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
  isStreaming?: boolean;
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
    const w = stringWidth(g);
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
  function ChatPanel({ messages, width = 80, height, isStreaming }, ref) {
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);
    const panelHeight = Math.max(1, height ?? 10);
    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const syntaxStyle = useMemo(() => {
      const style = SyntaxStyle.create();
      // Heading levels (tree-sitter markdown captures)
      for (let i = 1; i <= 6; i++) {
        style.registerStyle(`markup.heading.${i}`, { fg: "#ff79c6", bold: true });
      }
      style.registerStyle("markup.heading", { fg: "#ff79c6", bold: true });
      // Inline text styles
      style.registerStyle("markup.strong", { bold: true });
      style.registerStyle("markup.italic", { fg: "#bd93f9", italic: true });
      style.registerStyle("markup.strikethrough", {});
      // Links
      style.registerStyle("markup.link", { fg: "#8be9fd", underline: true });
      style.registerStyle("markup.link.label", { fg: "#8be9fd", underline: true });
      style.registerStyle("markup.link.url", { fg: "#8be9fd" });
      // Code (inline and blocks)
      style.registerStyle("markup.raw", { fg: "#a5b4fc" });
      style.registerStyle("markup.raw.block", { fg: "#f8f8f2", bg: "#44475a" });
      // Lists
      style.registerStyle("markup.list", { fg: "#ff79c6" });
      style.registerStyle("markup.list.unchecked", { fg: "#ff79c6" });
      style.registerStyle("markup.list.checked", { fg: "#ff79c6" });
      // Blockquote
      style.registerStyle("markup.quote", { fg: "#6272a4" });
      // Punctuation (hr, block quote markers, table borders)
      style.registerStyle("punctuation.special", { fg: "#6272a4" });
      return style;
    }, []);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        const sb = scrollboxRef.current;
        if (sb) sb.scrollTo({ y: sb.scrollHeight });
      },
      scrollUp: () => {
        scrollboxRef.current?.scrollBy(-3, "step");
      },
      scrollDown: () => {
        scrollboxRef.current?.scrollBy(3, "step");
      },
    }));

    return (
      <scrollbox
        ref={scrollboxRef}
        width={width}
        height={panelHeight}
        flexGrow={1}
        stickyScroll={true}
        stickyStart="bottom"
        scrollY={true}
        scrollX={false}
      >
        <box flexDirection="column" width={contentWidth}>
          {messages.map((msg, msgIdx) => {
            const isLast = msgIdx === messages.length - 1;
            const msgStreaming = isStreaming && isLast;
            const marginTop = msgIdx > 0 ? 1 : 0;

            switch (msg.type) {
              case "user": {
                const margin = "  ";
                const prefix = "> ";
                const prefixWidth = stringWidth(prefix);
                const available = Math.max(1, contentWidth - 2 - prefixWidth);
                const wrapped = wrapText(msg.content, available, prefixWidth);
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    bg="#333333"
                    marginTop={marginTop}
                  >
                    {wrapped.map((line, j) => (
                      <text key={j} bg="#333333">
                        {j === 0
                          ? margin + prefix + line
                          : margin + " ".repeat(prefixWidth) + line}
                      </text>
                    ))}
                  </box>
                );
              }

              case "agent": {
                const margin = "  ";
                const prefix = "⏺ ";
                const prefixWidth = stringWidth(prefix);
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    marginTop={marginTop}
                  >
                    {msg.thinking && (
                      <>
                        {msg.thinkingCollapsed ? (
                          <text fg="#6c6c7c">
                            {margin}▼ Thinking... (ctrl+o to expand)
                          </text>
                        ) : (
                          <>
                            <text fg="#6c6c7c">{margin}▶ Thinking:</text>
                            {wrapText(
                              msg.thinking,
                              contentWidth - 2,
                              2
                            ).map((line, j) => (
                              <text key={`think-${j}`} fg="#6c6c7c">
                                {margin}  {line}
                              </text>
                            ))}
                          </>
                        )}
                        <text />
                      </>
                    )}
                    {msg.content.length > 0 && (
                      <box flexDirection="row" width={contentWidth}>
                        <text width={prefixWidth}>{prefix}</text>
                        <markdown
                          content={msg.content}
                          syntaxStyle={syntaxStyle}
                          width={contentWidth - prefixWidth}
                          streaming={msgStreaming}
                          conceal={true}
                          tableOptions={{ borderColor: "#6272a4", style: "columns" }}
                        />
                      </box>
                    )}
                  </box>
                );
              }

              case "status": {
                return (
                  <text key={msg.id} fg="#6c6c7c" marginTop={marginTop}>
                    * {msg.content}
                  </text>
                );
              }

              case "tool_call": {
                const margin = "  ";
                const summary = summarizeToolCall(msg.toolName, msg.args);
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    marginTop={marginTop}
                  >
                    {msg.collapsed ? (
                      <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
                        {margin}▼ {summary}
                        {msg.isError ? " [error]" : ""} (ctrl+o to expand)
                      </text>
                    ) : (
                      <>
                        <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
                          {margin}▶ {msg.toolName}
                        </text>
                        {wrapText(
                          JSON.stringify(msg.args, null, 2),
                          contentWidth,
                          2
                        ).map((line, j) => (
                          <text key={`args-${j}`} fg="#6c6c7c">
                            {margin}  {line}
                          </text>
                        ))}
                        {msg.result !== undefined && (
                          <>
                            <text fg="#6c6c7c">{margin}  ──</text>
                            {wrapText(
                              formatResult(msg.result, msg.isError),
                              contentWidth,
                              2
                            ).map((line, j) => (
                              <text
                                key={`res-${j}`}
                                fg={msg.isError ? "#ff5555" : "#6c6c7c"}
                              >
                                {margin}  {line}
                              </text>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </box>
                );
              }

              case "system": {
                const wrapped = wrapText(msg.content, contentWidth, 0);
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    marginTop={marginTop}
                  >
                    {wrapped.map((line, j) => (
                      <text key={j} fg="#6c6c7c">
                        {line}
                      </text>
                    ))}
                  </box>
                );
              }

              case "compaction":
              case "retry": {
                return (
                  <text key={msg.id} fg="#6c6c7c" marginTop={marginTop}>
                    {msg.content}
                  </text>
                );
              }
            }
          })}
        </box>
      </scrollbox>
    );
  }
);
