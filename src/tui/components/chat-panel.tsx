/**
 * Chat Panel Component
 *
 * Renders the scrollable message history using OpenTUI native components.
 * Supports per-tool-type rendering, diff views, segmented markdown with
 * custom code blocks, separators, and image links.
 */

import { useMemo, useImperativeHandle, forwardRef, useRef, useState, useEffect } from "react";
import stringWidth from "string-width";
import { SyntaxStyle, createTextAttributes, type ScrollBoxRenderable, type MouseEvent, RGBA } from "@opentui/core";
import { imageToHalfBlocks, type ImageRow } from "./image-utils.js";

export type UIMessage =
  | { id: string; type: "user"; content: string; displayContent?: string }
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
  | { id: string; type: "system"; content: string; collapsed?: boolean }
  | { id: string; type: "compaction"; content: string }
  | {
      id: string;
      type: "retry";
      attempt: number;
      maxAttempts: number;
      content: string;
    }
  | { id: string; type: "plan"; content: string };

interface ChatPanelProps {
  messages: UIMessage[];
  width?: number;
  height?: number;
  onToggleCollapse?: (id: string) => void;
  onImageClick?: (url: string) => void;
  isStreaming?: boolean;
}

export interface ChatPanelHandle {
  scrollToBottom: () => void;
  scrollUp: () => void;
  scrollDown: () => void;
}

/**
 * Text Utilities
 *
 * wrapText uses Intl.Segmenter for grapheme-accurate wrapping (handles emoji/CJK correctly).
 * padToWidth pads with spaces so background colors fill the full line width in the TUI.
 */

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

/**
 * Middle Truncation
 *
 * Truncates text to fit within maxWidth, preserving the beginning and end,
 * with an ellipsis in the middle. Correctly handles CJK characters and emoji
 * by using string-width for accurate visual width calculation.
 */
function truncateMiddle(text: string, maxWidth: number): string {
  const w = stringWidth(text);
  if (w <= maxWidth) return text;

  // Reserve space for ellipsis
  const ellipsis = "...";
  const ellipsisWidth = stringWidth(ellipsis);
  const availableWidth = maxWidth - ellipsisWidth;

  if (availableWidth <= 0) {
    // Max width is too small even for ellipsis, just return partial ellipsis
    const partial = stringWidth(ellipsis) > maxWidth ? ".." : ".";
    return partial.slice(0, Math.min(partial.length, Math.floor(maxWidth / stringWidth("."))));
  }

  // Split available width between head and tail (roughly equal)
  const headMaxWidth = Math.ceil(availableWidth / 2);
  const tailMaxWidth = Math.floor(availableWidth / 2);

  // Find head portion that fits
  let head = "";
  let headWidth = 0;
  for (const seg of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)) {
    const segWidth = stringWidth(seg.segment);
    if (headWidth + segWidth > headMaxWidth) break;
    head += seg.segment;
    headWidth += segWidth;
  }

  // Find tail portion that fits (from the end)
  let tail = "";
  let tailWidth = 0;
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = [...segmenter.segment(text)];
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg) break;
    const segWidth = stringWidth(seg.segment);
    if (tailWidth + segWidth > tailMaxWidth) break;
    tail = seg.segment + tail;
    tailWidth += segWidth;
  }

  return head + ellipsis + tail;
}

/**
 * Tool Summary
 *
 * Maps tool names to short one-line descriptions for the collapsed tool_call view.
 */

const TOOL_SUMMARY_MAP: Record<string, (args: Record<string, unknown>) => string> = {
  read: (a) => `read: ${String(a["path"] ?? a["file"] ?? "?")}`,
  bash: (a) => {
    const cmd = String(a["command"] ?? "");
    // Reserve 10 chars for "bash: " prefix
    const prefix = "bash: ";
    const maxCmdWidth = 60 - stringWidth(prefix);
    const truncatedCmd = truncateMiddle(cmd, maxCmdWidth);
    return `${prefix}${truncatedCmd}`;
  },
  edit: (a) => `edit: ${String(a["path"] ?? a["file"] ?? "?")}`,
  write: (a) => `write: ${String(a["path"] ?? a["file"] ?? "?")}`,
  grep: (a) => `grep: ${String(a["pattern"] ?? "?")}`,
  find: (a) => `find: ${String(a["path"] ?? ".")}`,
  ls: (a) => `ls: ${String(a["path"] ?? ".")}`,
  webfetch: (a) => {
    const url = String(a["url"] ?? "?");
    // Reserve 12 chars for "webfetch: " prefix
    const prefix = "webfetch: ";
    const maxUrlWidth = 70 - stringWidth(prefix);
    return `${prefix}${truncateMiddle(url, maxUrlWidth)}`;
  },
};

/**
 * Tool Classification
 *
 * Determines expand/collapse behavior per tool type.
 */

const NON_EXPANDABLE_TOOLS = new Set(["read", "glob", "grep", "ls", "taskCreate", "taskGet", "taskList", "taskUpdate"]);
const FORCE_EXPANDED_TOOLS = new Set(["write", "edit"]);

export function isToolExpandable(toolName: string): boolean {
  return !NON_EXPANDABLE_TOOLS.has(toolName) && !FORCE_EXPANDED_TOOLS.has(toolName);
}

export function isToolForceExpanded(toolName: string): boolean {
  return FORCE_EXPANDED_TOOLS.has(toolName);
}

export function getToolDefaultCollapsed(toolName: string, allExpanded: boolean): boolean {
  if (FORCE_EXPANDED_TOOLS.has(toolName)) return false;
  if (NON_EXPANDABLE_TOOLS.has(toolName)) return true;
  return !allExpanded;
}

function summarizeToolCall(toolName: string, args: Record<string, unknown>): string {
  try {
    const formatter = TOOL_SUMMARY_MAP[toolName];
    if (formatter) return formatter(args);
    // Fallback for unknown tools: truncate JSON args with middle ellipsis
    const jsonArgs = JSON.stringify(args);
    const prefix = `${toolName}: `;
    const maxArgsWidth = 60 - stringWidth(prefix);
    return `${prefix}${truncateMiddle(jsonArgs, maxArgsWidth)}`;
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

function extractToolResultText(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r["content"])) {
      const texts = r["content"]
        .filter(
          (c): c is { type: string; text: string } =>
            typeof c === "object" && c !== null && (c as Record<string, unknown>)["type"] === "text"
        )
        .map((c) => c["text"]);
      return texts.join("\n");
    }
    if (typeof r["text"] === "string") return r["text"];
  }
  return formatResult(result);
}

function extractDiffFromResult(result: unknown): string | null {
  if (result === undefined || result === null) return null;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (typeof r["details"] === "object" && r["details"] !== null) {
      const diff = (r["details"] as Record<string, unknown>)["diff"];
      if (typeof diff === "string" && diff.length > 0) return diff;
    }
    const text = extractToolResultText(result);
    const diffIndex = text.indexOf("Diff:\n");
    if (diffIndex >= 0) return text.slice(diffIndex + 6);
  }
  return null;
}

function tailLines(text: string, count: number): { lines: string[]; total: number } {
  const all = text.split("\n");
  return {
    lines: all.length > count ? all.slice(-count) : all,
    total: all.length,
  };
}

function middleEllipsisLines(text: string, maxLines: number, headCount: number, tailCount: number): string[] {
  const all = text.split("\n");
  if (all.length <= maxLines) return all;
  const head = all.slice(0, headCount);
  const tail = all.slice(-tailCount);
  const omitted = all.length - headCount - tailCount;
  return [...head, `... (${omitted} lines omitted) ...`, ...tail];
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatDuration(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

/**
 * Markdown Segment Parser
 *
 * Splits finalized markdown content into segments so that code blocks,
 * horizontal rules, and images can be rendered with custom components.
 */

type MarkdownSegment =
  | { type: "text"; content: string }
  | { type: "code"; language: string; content: string }
  | { type: "hr" }
  | { type: "image"; alt: string; url: string };

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  jsonc: "json",
  md: "markdown",
  tf: "hcl",
  hcl: "hcl",
};

function normalizeLang(lang: string): string {
  return LANG_MAP[lang] ?? lang;
}

function ImageThumbnail({
  url,
  alt,
  onClick,
}: {
  url: string;
  alt: string;
  onClick: () => void;
}) {
  const [rows, setRows] = useState<ImageRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await imageToHalfBlocks(url, 30, 12);
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (rows) {
    return (
      <box
        flexDirection="column"
        marginTop={1}
        marginBottom={1}
        onMouseUp={onClick}
      >
        {rows.map((row, y) => (
          <text key={y}>
            {row.map((cell, x) => (
              <span key={x} fg={cell.fg} bg={cell.bg}>
                {"▄"}
              </span>
            ))}
          </text>
        ))}
        <text fg="#6c6c7c" marginTop={1} attributes={createTextAttributes({ dim: true })}>
          {`[Click to enlarge] ${alt || url}`}
        </text>
      </box>
    );
  }

  return (
    <box flexDirection="row" marginTop={1} marginBottom={1}>
      <text fg="#8be9fd" onMouseUp={onClick}>
        {loading ? `[Loading image: ${alt || url}]` : `[Image: ${alt || url}]`}
      </text>
    </box>
  );
}

function parseTextSegment(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  // Match horizontal rules or inline images
  const regex = /(^[ \t]*---[ \t]*$|!\[([^\]]*)\]\(([^)]+)\))/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    if (match[0].startsWith("!")) {
      segments.push({ type: "image", alt: match[2]!, url: match[3]! });
    } else {
      segments.push({ type: "hr" });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

function parseMarkdownSegments(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...parseTextSegment(content.slice(lastIndex, match.index)));
    }
    segments.push({ type: "code", language: match[1]!.trim(), content: match[2]! });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push(...parseTextSegment(content.slice(lastIndex)));
  }

  return segments;
}

/**
 * Message Renderers
 */

function stripKoiContext(content: string): string {
  return content.replace(/<koi_context>[\s\S]*?<\/koi_context>/g, "").trimEnd();
}

function stripHookContext(content: string): string {
  return content.replace(/\n\n\[Hook context\]:[\s\S]*/, "").trimEnd();
}

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
  const displayText = msg.displayContent || msg.content;
  const wrapped = wrapText(stripHookContext(stripKoiContext(displayText)), available, prefixWidth);

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

function SegmentedMarkdownContent({
  content,
  width,
  syntaxStyle,
  onImageClick,
}: {
  content: string;
  width: number;
  syntaxStyle: SyntaxStyle;
  onImageClick: (url: string) => void;
}) {
  const segments = useMemo(() => parseMarkdownSegments(content), [content]);

  return (
    <box flexDirection="column" width={width}>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case "text":
            if (!seg.content.trim()) return <text key={i} />;
            return (
              <MarkdownContent
                key={i}
                content={seg.content}
                width={width}
                streaming={false}
                syntaxStyle={syntaxStyle}
              />
            );
          case "code": {
            const lang = normalizeLang(seg.language);
            return (
              <box
                key={i}
                flexDirection="column"
                width={width}
                border={["left"]}
                borderColor="#6272a4"
                paddingLeft={1}
                marginTop={1}
                marginBottom={1}
              >
                <code
                  content={seg.content}
                  filetype={lang || undefined}
                  syntaxStyle={syntaxStyle}
                  conceal={true}
                  width={width - 2}
                />
              </box>
            );
          }
          case "hr":
            return (
              <text key={i} fg="#6c6c7c" marginLeft={2} marginRight={2} marginTop={1} marginBottom={1}>
                {"─".repeat(Math.max(1, width - 4))}
              </text>
            );
          case "image":
            return (
              <ImageThumbnail
                key={i}
                url={seg.url}
                alt={seg.alt}
                onClick={() => onImageClick(seg.url)}
              />
            );
        }
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
  onImageClick,
}: {
  msg: UIMessage & { type: "agent" };
  contentWidth: number;
  marginTop: number;
  isStreaming: boolean;
  spinnerFrame: number;
  onImageClick: (url: string) => void;
}) {
  const margin = "  ";
  const prefix = "⏺ ";
  const prefixWidth = stringWidth(prefix);
  const thinkingInProgress = msg.thinking && msg.thinkingStartTime && !msg.thinkingEndTime;
  const thinkingElapsed = thinkingInProgress
    ? Date.now() - (msg.thinkingStartTime ?? 0)
    : (msg.thinkingEndTime ?? 0) - (msg.thinkingStartTime ?? 0);
  const thinkingDuration = formatDuration(thinkingElapsed);
  const syntaxStyle = useMemo(() => buildSyntaxStyle(), []);

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
          {isStreaming ? (
            <MarkdownContent
              content={msg.content.trimEnd()}
              width={contentWidth - prefixWidth}
              streaming={isStreaming}
              syntaxStyle={syntaxStyle}
            />
          ) : (
            <SegmentedMarkdownContent
              content={msg.content.trimEnd()}
              width={contentWidth - prefixWidth}
              syntaxStyle={syntaxStyle}
              onImageClick={onImageClick}
            />
          )}
        </box>
      )}
    </box>
  );
}

function StatusMessage({ msg, marginTop, spinnerFrame }: { msg: UIMessage & { type: "status" }; marginTop: number; spinnerFrame?: number }) {
  const margin = "  ";
  const isHookRunning = msg.content.startsWith("Hook [");
  const prefix = isHookRunning ? SPINNER[spinnerFrame ?? 0] : "*";
  const fgColor = isHookRunning ? "#00f5ff" : "#6c6c7c";
  return (
    <text fg={fgColor} marginTop={marginTop}>{margin}{prefix} {msg.content}</text>
  );
}

// Terminal default background color - uses INTENT_DEFAULT to tell the terminal
// to use its actual default background instead of a hardcoded color
const DEFAULT_BG = RGBA.defaultBackground();

function DiffToolContent({
  diff,
  contentWidth,
  filePath,
}: {
  diff: string;
  contentWidth: number;
  filePath?: string;
}) {
  const syntaxStyle = useMemo(() => buildSyntaxStyle(), []);
  return (
    <box marginTop={1} flexDirection="column" width={contentWidth - 4}>
      {filePath && (
        <text fg="#8be9fd" marginBottom={1}>{filePath}</text>
      )}
      <diff
        diff={diff}
        view="unified"
        showLineNumbers={true}
        width={contentWidth - 4}
        syntaxStyle={syntaxStyle}
        addedSignColor="#50fa7b"
        removedSignColor="#ff5555"
        addedBg="#1d3b2a"
        removedBg="#3b1d1d"
        contextBg={DEFAULT_BG}
        addedContentBg="#1d3b2a"
        removedContentBg="#3b1d1d"
        contextContentBg={DEFAULT_BG}
        lineNumberFg="#6c6c7c"
        lineNumberBg={DEFAULT_BG}
        fg="#f8f8f2"
      />
    </box>
  );
}

function BashToolContent({
  result,
  contentWidth,
}: {
  result: unknown;
  contentWidth: number;
}) {
  const margin = "  ";
  const text = extractToolResultText(result);
  const { lines, total } = tailLines(text, 15);

  return (
    <box flexDirection="column" width={contentWidth}>
      {total > 15 && (
        <text fg="#6c6c7c">{margin}  ... (showing last 15 of {total} lines)</text>
      )}
      {lines.map((line, j) => (
        <text key={`bash-${j}`} fg="#6c6c7c">{margin}  {line}</text>
      ))}
    </box>
  );
}

function WebfetchToolContent({
  result,
  contentWidth,
}: {
  result: unknown;
  contentWidth: number;
}) {
  const margin = "  ";
  const text = extractToolResultText(result);
  const lines = middleEllipsisLines(text, 30, 10, 10);

  return (
    <box flexDirection="column" width={contentWidth}>
      {lines.map((line, j) => (
        <text key={`wf-${j}`} fg="#6c6c7c">{margin}  {line}</text>
      ))}
    </box>
  );
}

function ToolCallMessage({
  msg,
  contentWidth,
  marginTop,
  spinnerFrame,
  onToggleCollapse,
}: {
  msg: UIMessage & { type: "tool_call" };
  contentWidth: number;
  marginTop: number;
  spinnerFrame?: number;
  onToggleCollapse?: (id: string) => void;
}) {
  const margin = "  ";
  const summary = summarizeToolCall(msg.toolName, msg.args);
  const isExecuting = msg.result === undefined && !msg.isError;
  const statusIcon = msg.isError
    ? "·"
    : isExecuting
      ? SPINNER[spinnerFrame ?? 0]
      : "·";
  const statusColor = msg.isError
    ? "#ff5555"
    : isExecuting
      ? "#00f5ff"
      : "#50fa7b";

  const expandable = isToolExpandable(msg.toolName);
  const forceExpanded = isToolForceExpanded(msg.toolName);

  const handleToggle = (e: MouseEvent) => {
    if (expandable && onToggleCollapse) {
      e.stopPropagation();
      onToggleCollapse(msg.id);
    }
  };

  // Non-expandable tools always render collapsed summary
  if (!expandable && !forceExpanded) {
    return (
      <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
        <box flexDirection="row">
          <text fg={statusColor}>{margin}{statusIcon} </text>
          <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
            {summary}{msg.isError ? " [error]" : ""}
          </text>
        </box>
      </box>
    );
  }

  // Force-expanded tools (write/edit) always render expanded with diff
  if (forceExpanded) {
    const diff = extractDiffFromResult(msg.result);
    const filePath = String(msg.args["path"] ?? msg.args["file"] ?? "");
    return (
      <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
        <box flexDirection="row">
          <text fg={statusColor}>{margin}{statusIcon} </text>
          <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>{msg.toolName} {filePath}</text>
        </box>
        {msg.result !== undefined && diff ? (
          <DiffToolContent diff={diff} contentWidth={contentWidth} />
        ) : msg.result !== undefined ? (
          wrapText(
            msg.isError ? `Error: ${extractToolResultText(msg.result)}` : extractToolResultText(msg.result),
            contentWidth,
            2
          ).map((line, j) => (
            <text key={`res-${j}`} fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
              {margin}  {line}
            </text>
          ))
        ) : (
          <text fg="#00f5ff">{margin}  Executing...</text>
        )}
      </box>
    );
  }

  // Expandable tools (bash, webfetch, and others)
  const isCollapsed = msg.collapsed;

  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {isCollapsed ? (
        <box flexDirection="row" onMouseUp={handleToggle}>
          <text fg={statusColor}>{margin}{statusIcon} </text>
          <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
            {summary}{msg.isError ? " [error]" : ""} (ctrl+o to expand)
          </text>
        </box>
      ) : (
        <>
          <box flexDirection="row" onMouseUp={handleToggle}>
            <text fg={statusColor}>{margin}{statusIcon} </text>
            <text fg={msg.isError ? "#ff5555" : "#6c6c7c"}>{msg.toolName}</text>
          </box>
          {wrapText(JSON.stringify(msg.args, null, 2), contentWidth, 2).map((line, j) => (
            <text key={`args-${j}`} fg="#6c6c7c">{margin}  {line}</text>
          ))}
          {msg.result !== undefined ? (
            <>
              <text fg="#6c6c7c">{margin}  ──</text>
              {msg.toolName === "bash" ? (
                <BashToolContent result={msg.result} contentWidth={contentWidth} />
              ) : msg.toolName === "webfetch" ? (
                <WebfetchToolContent result={msg.result} contentWidth={contentWidth} />
              ) : (
                wrapText(
                  msg.isError ? `Error: ${extractToolResultText(msg.result)}` : extractToolResultText(msg.result),
                  contentWidth,
                  2
                ).map((line, j) => (
                  <text key={`res-${j}`} fg={msg.isError ? "#ff5555" : "#6c6c7c"}>
                    {margin}  {line}
                  </text>
                ))
              )}
            </>
          ) : (
            <text fg="#00f5ff">{margin}  Executing...</text>
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
  onToggleCollapse,
}: {
  msg: UIMessage & { type: "system" };
  contentWidth: number;
  marginTop: number;
  onToggleCollapse?: (id: string) => void;
}) {
  const margin = "  ";
  const dot = "·";
  const dotColor = "#6c6c7c";
  const isCollapsed = msg.collapsed ?? false;
  const firstLine = msg.content.split("\n")[0] ?? "";
  const handleToggle = (e: MouseEvent) => {
    if (onToggleCollapse) {
      e.stopPropagation();
      onToggleCollapse(msg.id);
    }
  };

  return (
    <box flexDirection="column" width={contentWidth} marginTop={marginTop}>
      {isCollapsed ? (
        <box flexDirection="row" onMouseUp={handleToggle}>
          <text fg={dotColor}>{margin}{dot} </text>
          <text fg="#4a4a5c">{firstLine}</text>
          <text fg="#3a3a4c"> (click to expand)</text>
        </box>
      ) : (
        <>
          {wrapText(msg.content, contentWidth, 2).map((line, j) => (
            <text key={j} fg="#6c6c7c" onMouseUp={handleToggle}>{margin}{dot} {line}</text>
          ))}
        </>
      )}
    </box>
  );
}

function SimpleMessage({ msg, marginTop, spinnerFrame }: { msg: UIMessage & { type: "compaction" | "retry" }; marginTop: number; spinnerFrame?: number }) {
  const margin = "  ";
  // For compaction messages, show spinner during compaction, dot on success
  if (msg.type === "compaction") {
    const isCompacting = msg.content.includes("Compacting");
    const isSuccess = msg.content === "Session compacted." || msg.content === "Compaction aborted.";
    if (isCompacting) {
      return <text fg="#00f5ff" marginTop={marginTop}>{margin}{SPINNER[spinnerFrame ?? 0]} {msg.content}</text>;
    }
    if (isSuccess) {
      return <text fg="#6c6c7c" marginTop={marginTop}>{margin}· {msg.content}</text>;
    }
  }
  return <text fg="#6c6c7c" marginTop={marginTop}>{msg.content}</text>;
}

function PlanMessage({
  msg,
  contentWidth,
  marginTop,
}: {
  msg: UIMessage & { type: "plan" };
  contentWidth: number;
  marginTop: number;
}) {
  const syntaxStyle = useMemo(() => buildSyntaxStyle(), []);
  return (
    <box
      flexDirection="column"
      width={contentWidth}
      marginTop={marginTop}
      borderStyle="rounded"
      borderColor="#60a5fa"
      backgroundColor="#1e3a5f"
      paddingX={1}
      paddingY={1}
    >
      <text fg="#60a5fa" attributes={createTextAttributes({ bold: true })}>
        {"📋 Plan"}
      </text>
      <box marginTop={1}>
        <MarkdownContent
          content={msg.content}
          width={contentWidth - 2}
          streaming={false}
          syntaxStyle={syntaxStyle}
        />
      </box>
    </box>
  );
}

/**
 * Syntax Style
 *
 * Registers Dracula-like colors for markdown elements rendered by OpenTUI's native markdown component.
 */

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
  syntaxStyle,
}: {
  content: string;
  width: number;
  streaming: boolean;
  syntaxStyle: SyntaxStyle;
}) {
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

/**
 * Margin Calculator
 *
 * Consecutive tool_call messages are rendered with 0 margin so they visually group
 * into a single "tool batch". All other adjacent pairs get 1 line of separation.
 */

function getMarginTop(messages: UIMessage[], msgIdx: number): number {
  if (msgIdx === 0) return 0;
  const prevMsg = messages[msgIdx - 1];
  const msg = messages[msgIdx];
  if (msg?.type === "tool_call" && prevMsg?.type === "tool_call") return 0;
  return 1;
}

/**
 * ChatPanel
 *
 * Scrollable message history with sticky bottom scroll.
 * Exposes imperative scroll handles (scrollUp/scrollDown) for the global keyboard shortcuts.
 */

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
  function ChatPanel({ messages, width = 80, height, isStreaming, onToggleCollapse, onImageClick }, ref) {
    const scrollboxRef = useRef<ScrollBoxRenderable>(null);
    const panelHeight = Math.max(1, height ?? 10);
    const contentWidth = Math.max(1, (width ?? 80) - 2);
    const [spinnerFrame, setSpinnerFrame] = useState(0);
    useEffect(() => {
      const hasThinkingInProgress = messages.some(
        (m) => m.type === "agent" && m.thinking && m.thinkingStartTime && !m.thinkingEndTime
      );
      const hasToolExecuting = messages.some(
        (m) => m.type === "tool_call" && m.result === undefined && !m.isError
      );
      const hasCompacting = messages.some(
        (m) => m.type === "compaction" && m.content.includes("Compacting")
      );
      if (!hasThinkingInProgress && !hasToolExecuting && !hasCompacting) return;
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
                    onImageClick={onImageClick ?? (() => {})}
                  />
                );
              case "status":
                return <StatusMessage key={msg.id} msg={msg} marginTop={marginTop} spinnerFrame={spinnerFrame} />;
              case "tool_call":
                return (
                  <ToolCallMessage
                    key={msg.id}
                    msg={msg}
                    contentWidth={contentWidth}
                    marginTop={marginTop}
                    spinnerFrame={spinnerFrame}
                    onToggleCollapse={onToggleCollapse}
                  />
                );
              case "system":
                return <SystemMessage key={msg.id} msg={msg} contentWidth={contentWidth} marginTop={marginTop} onToggleCollapse={onToggleCollapse} />;
              case "compaction":
              case "retry":
                return <SimpleMessage key={msg.id} msg={msg} marginTop={marginTop} spinnerFrame={spinnerFrame} />;
              case "plan":
                return <PlanMessage key={msg.id} msg={msg} contentWidth={contentWidth} marginTop={marginTop} />;
            }
          })}
          <text />
        </box>
      </scrollbox>
    );
  }
);
