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

/* ───────── Text Utilities ───────── */

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

/* ───────── Tool Summary ───────── */

const TOOL_SUMMARY_MAP: Record<string, (args: Record<string, unknown>) => string> = {
  read: (a) => `read: ${String(a["path"] ?? a["file"] ?? "?")}`,
  bash: (a) => {
    const cmd = String(a["command"] ?? "");
    return `bash: ${cmd.slice(0, 40)}${cmd.length > 40 ? "..." : ""}`;
  },
  edit: (a) => `edit: ${String(a["path"] ?? a["file"] ?? "?")}`,
  write: (a) => `write: ${String(a["path"] ?? a["file"] ?? "?")}`,
  grep: (a) => `grep: ${String(a["pattern"] ?? "?")}`,
  find: (a) => `find: ${String(a["path"] ?? ".")}`,
  ls: (a) => `ls: ${String(a["path"] ?? ".")}`,
};

function summarizeToolCall(toolName: string, args: Record<string, unknown>): string {
  try {
    const formatter = TOOL_SUMMARY_MAP[toolName];
    if (formatter) return formatter(args);
    return `${toolName}: ${JSON.stringify(args).slice(0, 40)}`;
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
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

/* ───────── Message Renderers ───────── */

function UserMessage({
  msg,
  contentWidth,
  marginTop,
}: {
  msg: UIMessage & { type: "user" };
  contentWidth: number;
  marginTop: number;
}) {
  const margin = "  ";
  const prefix = "> ";
  const prefixWidth = stringWidth(prefix);
  const available = Math.max(1, contentWidth - 2 - prefixWidth);
  const wrapped = wrapText(msg.content, available, prefixWidth);

  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {wrapped.map((line, j) => {
        const raw = j === 0 ? margin + prefix + line : margin + " ".repeat(prefixWidth) + line;
        return (
          <text key={j} bg="#333333">
            {padToWidth(raw, contentWidth)}
          </text>
        );
      })}
    </box>
  );
}

function AgentMessage({
  msg,
  contentWidth,
  marginTop,
  isStreaming,
  spinnerFrame,
}: {
  msg: UIMessage & { type: "agent" };
  contentWidth: number;
  marginTop: number;
  isStreaming: boolean;
  spinnerFrame: number;
}) {
  const margin = "  ";
  const prefix = "⏺ ";
  const prefixWidth = stringWidth(prefix);
  const thinkingInProgress = msg.thinking && msg.thinkingStartTime && !msg.thinkingEndTime;
  const thinkingElapsed = thinkingInProgress
    ? Date.now() - (msg.thinkingStartTime ?? 0)
    : (msg.thinkingEndTime ?? 0) - (msg.thinkingStartTime ?? 0);
  const thinkingDuration = formatDuration(thinkingElapsed);

  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {msg.thinking && thinkingInProgress && (
        <>
          <box flexDirection="row">
            <text fg="#00f5ff">{margin}{SPINNER[spinnerFrame]}</text>
            <text fg="#6c6c7c" marginLeft={1}>Thinking... {thinkingDuration}</text>
          </box>
          {wrapText(msg.thinking, contentWidth - 2, 2).map((line, j) => (
            <text key={`think-${j}`} fg="#6c6c7c">{margin}  {line}</text>
          ))}
          {msg.content.trimEnd().length > 0 && <text />}
        </>
      )}
      {msg.thinking && !thinkingInProgress && (
        <>
          {(msg.thinkingCollapsed ?? true) ? (
            <text fg="#6c6c7c">{margin}▶ Thought for {thinkingDuration}</text>
          ) : (
            <>
              <text fg="#6c6c7c">{margin}▼ Thought for {thinkingDuration}</text>
              {wrapText(msg.thinking, contentWidth - 2, 2).map((line, j) => (
                <text key={`think-${j}`} fg="#6c6c7c">{margin}  {line}</text>
              ))}
            </>
          )}
          {msg.content.trimEnd().length > 0 && <text />}
        </>
      )}
      {msg.content.trimEnd().length > 0 && (
        <box flexDirection="row" width={contentWidth}>
          <text width={prefixWidth}>{prefix}</text>
          <MarkdownContent
            content={msg.content.trimEnd()}
            width={contentWidth - prefixWidth}
            streaming={isStreaming}
          />
        </box>
      )}
    </box>
  );
}

function StatusMessage({ msg, marginTop }: { msg: UIMessage & { type: "status" }; marginTop: number }) {
  return (
    <text fg="#6c6c7c" marginTop={marginTop}>* {msg.content}</text>
  );
}

function ToolCallMessage({
  msg,
  contentWidth,
  marginTop,
}: {
  msg: UIMessage & { type: "tool_call" };
  contentWidth: number;
  marginTop: number;
}) {
  const margin = "  ";
  const summary = summarizeToolCall(msg.toolName, msg.args);
  const statusColor = msg.isError
    ? "#ff5555"
    : msg.result === undefined
      ? "#f1fa8c"
      : "#50fa7b";

  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {msg.collapsed ? (
        <box flexDirection="row">
          <text fg={statusColor}>{margin}• </text>
          <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
            {summary}{msg.isError ? " [error]" : ""} (ctrl+o to expand)
          </text>
        </box>
      ) : (
        <>
          <box flexDirection="row">
            <text fg={statusColor}>{margin}• </text>
            <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>{msg.toolName}</text>
          </box>
          {wrapText(JSON.stringify(msg.args, null, 2), contentWidth, 2).map((line, j) => (
            <text key={`args-${j}`} fg="#6c6c7c">{margin}  {line}</text>
          ))}
          {msg.result !== undefined ? (
            <>
              <text fg="#6c6c7c">{margin}  ──</text>
              {wrapText(
                msg.isError ? `Error: ${formatResult(msg.result)}` : formatResult(msg.result),
                contentWidth,
                2
              ).map((line, j) => (
                <text key={`res-${j}`} fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
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

function SystemMessage({
  msg,
  contentWidth,
  marginTop,
}: {
  msg: UIMessage & { type: "system" };
  contentWidth: number;
  marginTop: number;
}) {
  const wrapped = wrapText(msg.content, contentWidth, 0);
  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {wrapped.map((line, j) => (
        <text key={j} fg="#6c6c7c">{line}</text>
      ))}
    </box>
  );
}

function SimpleMessage({ msg, marginTop }: { msg: UIMessage & { type: "compaction" | "retry" }; marginTop: number }) {
  return <text fg="#6c6c7c" marginTop={marginTop}>{msg.content}</text>;
}

/* ───────── Syntax Style ───────── */

function buildSyntaxStyle() {
  const style = SyntaxStyle.create();
  for (let i = 1; i <= 6; i++) {
    style.registerStyle(`markup.heading.${i}`, { fg: "#ff79c6", bold: true });
  }
  style.registerStyle("markup.heading", { fg: "#ff79c6", bold: true });
  style.registerStyle("markup.strong", { bold: true });
  style.registerStyle("markup.italic", { fg: "#bd93f9", italic: true });
  style.registerStyle("markup.strikethrough", {});
  style.registerStyle("markup.link", { fg: "#8be9fd", underline: true });
  style.registerStyle("markup.link.label", { fg: "#8be9fd", underline: true });
  style.registerStyle("markup.link.url", { fg: "#8be9fd" });
  style.registerStyle("markup.raw", { fg: "#a5b4fc" });
  style.registerStyle("markup.raw.block", { fg: "#f8f8f2", bg: "#44475a" });
  style.registerStyle("markup.list", { fg: "#ff79c6" });
  style.registerStyle("markup.list.unchecked", { fg: "#ff79c6" });
  style.registerStyle("markup.list.checked", { fg: "#ff79c6" });
  style.registerStyle("markup.quote", { fg: "#6272a4" });
  style.registerStyle("punctuation.special", { fg: "#6272a4" });
  return style;
}

function MarkdownContent({
  content,
  width,
  streaming,
}: {
  content: string;
  width: number;
  streaming: boolean;
}) {
  const syntaxStyle = useMemo(() => buildSyntaxStyle(), []);
  return (
    <markdown
      content={content}
      syntaxStyle={syntaxStyle}
      width={width}
      streaming={streaming}
      conceal={true}
      tableOptions={{ borderColor: "#6272a4", style: "columns" }}
    />
  );
}

/* ───────── Margin Calculator ───────── */

function getMarginTop(messages: UIMessage[], msgIdx: number): number {
  if (msgIdx === 0) return 0;
  const prevMsg = messages[msgIdx - 1];
  const msg = messages[msgIdx];
  if (msg?.type === "tool_call" && prevMsg?.type === "tool_call") return 0;
  return 1;
}

/* ───────── ChatPanel ───────── */

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, width = 80, height, isStreaming }, ref) {
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);
    const panelHeight = Math.max(1, height ?? 10);
    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const [spinnerFrame, setSpinnerFrame] = useState(0);

    useEffect(() => {
      const hasThinkingInProgress = messages.some(
        (m) => m.type === "agent" && m.thinking && m.thinkingStartTime && !m.thinkingEndTime
      );
      if (!hasThinkingInProgress) return;
      const interval = setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), 80);
      return () => clearInterval(interval);
    }, [messages]);

    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        const sb = scrollboxRef.current;
        if (sb) sb.scrollTo({ x: 0, y: sb.scrollHeight });
      },
      scrollUp: () => scrollboxRef.current?.scrollBy(-3, "step"),
      scrollDown: () => scrollboxRef.current?.scrollBy(3, "step"),
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
            const msgStreaming = Boolean(isStreaming && isLast);
            const marginTop = getMarginTop(messages, msgIdx);

            switch (msg.type) {
              case "user":
                return <UserMessage key={msg.id} msg={msg} contentWidth={contentWidth} marginTop={marginTop} />;
              case "agent":
                return (
                  <AgentMessage
                    key={msg.id}
                    msg={msg}
                    contentWidth={contentWidth}
                    marginTop={marginTop}
                    isStreaming={msgStreaming}
                    spinnerFrame={spinnerFrame}
                  />
                );
              case "status":
                return <StatusMessage key={msg.id} msg={msg} marginTop={marginTop} />;
              case "tool_call":
                return <ToolCallMessage key={msg.id} msg={msg} contentWidth={contentWidth} marginTop={marginTop} />;
              case "system":
                return <SystemMessage key={msg.id} msg={msg} contentWidth={contentWidth} marginTop={marginTop} />;
              case "compaction":
              case "retry":
                return <SimpleMessage key={msg.id} msg={msg} marginTop={marginTop} />;
            }
          })}
          <text />
        </box>
      </scrollbox>
    );
  }
);
