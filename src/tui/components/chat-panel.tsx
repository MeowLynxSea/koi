/**
 * Chat Panel Component
 *
 * Renders the scrollable message history using OpenTUI native components.
 */

import { useMemo, useImperativeHandle, forwardRef, useRef, useState, useEffect } from "react";
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
      thinkingStartTime?: number;
      thinkingEndTime?: number;
      thinkingTokens?: number;
    }
  | { id: string; type: "status"; content: string }
  | {
      id: string;
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result?: unknown;
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

export function wrapText(text: string, width: number, indent: number): string[] {
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

function padToWidth(text: string, width: number): string {
  const w = stringWidth(text);
  if (w >= width) return text;
  return text + " ".repeat(Math.max(0, width - w));
}

function summarizeToolCall(toolName: string, args: Record<string, unknown>): string {
  try {
    switch (toolName) {
      case "read":
        return `read: ${String(args["path"] ?? args["file"] ?? "?")}`;
      case "bash":
        return `bash: ${String(args["command"] ?? "").slice(0, 40)}${String(args["command"] ?? "").length > 40 ? "..." : ""}`;
      case "edit":
        return `edit: ${String(args["path"] ?? args["file"] ?? "?")}`;
      case "write":
        return `write: ${String(args["path"] ?? args["file"] ?? "?")}`;
      case "grep":
        return `grep: ${String(args["pattern"] ?? "?")}`;
      case "find":
        return `find: ${String(args["path"] ?? ".")}`;
      case "ls":
        return `ls: ${String(args["path"] ?? ".")}`;
      default:
        return `${toolName}: ${JSON.stringify(args).slice(0, 40)}`;
    }
  } catch {
    return `${toolName}: ...`;
  }
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${s}s`;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, width = 80, height, isStreaming }, ref) {
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);
    const panelHeight = Math.max(1, height ?? 10);
    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const [spinnerFrame, setSpinnerFrame] = useState(0);

    useEffect(() => {
      const hasThinkingInProgress = messages.some(
        (m) =>
          m.type === "agent" &&
          m.thinking &&
          m.thinkingStartTime &&
          !m.thinkingEndTime
      );
      if (!hasThinkingInProgress) return;
      const interval = setInterval(() => {
        setSpinnerFrame((f) => (f + 1) % SPINNER.length);
      }, 80);
      return () => clearInterval(interval);
    }, [messages]);

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
        if (sb) sb.scrollTo({ x: 0, y: sb.scrollHeight });
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
          <text />
          {messages.map((msg, msgIdx) => {
            const isLast = msgIdx === messages.length - 1;
            const msgStreaming = isStreaming && isLast;
            let marginTop = msgIdx > 0 ? 1 : 0;
            if (msgIdx > 0) {
              const prevMsg = messages[msgIdx - 1]!;
              if (msg.type === "tool_call" && prevMsg.type === "tool_call") {
                marginTop = 0;
              }
            }

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
                    marginTop={marginTop}
                  >
                    {wrapped.map((line, j) => {
                      const raw =
                        j === 0
                          ? margin + prefix + line
                          : margin + " ".repeat(prefixWidth) + line;
                      return (
                        <text key={j} bg="#333333">
                          {padToWidth(raw, contentWidth)}
                        </text>
                      );
                    })}
                  </box>
                );
              }

              case "agent": {
                const margin = "  ";
                const prefix = "⏺ ";
                const prefixWidth = stringWidth(prefix);
                const thinkingInProgress =
                  msg.thinking &&
                  msg.thinkingStartTime &&
                  !msg.thinkingEndTime;
                const thinkingElapsed = thinkingInProgress
                  ? Date.now() - (msg.thinkingStartTime ?? 0)
                  : (msg.thinkingEndTime ?? 0) - (msg.thinkingStartTime ?? 0);
                const thinkingDuration = formatDuration(thinkingElapsed);
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    marginTop={marginTop}
                  >
                    {msg.thinking && thinkingInProgress && (
                      <>
                        <box flexDirection="row">
                          <text fg="#00f5ff">
                            {margin}{SPINNER[spinnerFrame]}
                          </text>
                          <text fg="#6c6c7c" marginLeft={1}>
                            Thinking... {thinkingDuration}
                          </text>
                        </box>
                        {wrapText(
                          msg.thinking,
                          contentWidth - 2,
                          2
                        ).map((line, j) => (
                          <text key={`think-${j}`} fg="#6c6c7c">
                            {margin}  {line}
                          </text>
                        ))}
                        {msg.content.trimEnd().length > 0 && <text />}
                      </>
                    )}
                    {msg.thinking && !thinkingInProgress && (
                      <>
                        {(msg.thinkingCollapsed ?? true) ? (
                          <text fg="#6c6c7c">
                            {margin}▶ Thought for {thinkingDuration}
                          </text>
                        ) : (
                          <>
                            <text fg="#6c6c7c">
                              {margin}▼ Thought for {thinkingDuration}
                            </text>
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
                        {msg.content.trimEnd().length > 0 && <text />}
                      </>
                    )}
                    {msg.content.trimEnd().length > 0 && (
                      <box flexDirection="row" width={contentWidth}>
                        <text width={prefixWidth}>{prefix}</text>
                        <markdown
                          content={msg.content.trimEnd()}
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
                const statusColor = msg.isError
                  ? "#ff5555"
                  : msg.result === undefined
                    ? "#f1fa8c"
                    : "#50fa7b";
                return (
                  <box
                    key={msg.id}
                    flexDirection="column"
                    width={contentWidth}
                    marginTop={marginTop}
                  >
                    {msg.collapsed ? (
                      <box flexDirection="row">
                        <text fg={statusColor}>{margin}• </text>
                        <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
                          {summary}
                          {msg.isError ? " [error]" : ""} (ctrl+o to expand)
                        </text>
                      </box>
                    ) : (
                      <>
                        <box flexDirection="row">
                          <text fg={statusColor}>{margin}• </text>
                          <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
                            {msg.toolName}
                          </text>
                        </box>
                        {wrapText(
                          JSON.stringify(msg.args, null, 2),
                          contentWidth,
                          2
                        ).map((line, j) => (
                          <text key={`args-${j}`} fg="#6c6c7c">
                            {margin}  {line}
                          </text>
                        ))}
                        {msg.result !== undefined ? (
                          <>
                            <text fg="#6c6c7c">{margin}  ──</text>
                            {wrapText(
                              msg.isError ? `Error: ${formatResult(msg.result)}` : formatResult(msg.result),
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
                        ) : (
                          <text fg="#f1fa8c">{margin}  Executing...</text>
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
          <text />
        </box>
      </scrollbox>
    );
  }
);
