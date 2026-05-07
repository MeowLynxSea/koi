/**
 * Chat Panel Component
 *
 * Renders the scrollable message history: user prompts, agent responses,
 * and markdown content.
 */

import type { Component } from "@mariozechner/pi-tui";
import { Markdown, type MarkdownTheme, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { markdownTheme, dimText } from "../theme.js";

interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

export class ChatPanel implements Component {
  private messages: Message[] = [];
  private scrollOffset = 0;
  private cachedWidth = 80;
  private cachedHeight = 24;
  private cachedLines: string[] | null = null;

  addMessage(role: "user" | "agent" | "system", content: string): void {
    this.messages.push({ role, content });
    this.cachedLines = null;
  }

  clear(): void {
    this.messages = [];
    this.scrollOffset = 0;
    this.cachedLines = null;
  }

  scrollUp(lines = 3): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
  }

  scrollDown(lines = 3): void {
    this.scrollOffset += lines;
  }

  scrollToBottom(): void {
    this.scrollOffset = Number.MAX_SAFE_INTEGER;
    this.cachedLines = null;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  render(width: number): string[] {
    // Note: this is called by KoiApp with a specific height budget.
    // We store width/height for internal layout but return whatever we can.
    this.cachedWidth = width;
    if (this.cachedLines) return this.cachedLines;

    const allLines: string[] = [];
    for (const msg of this.messages) {
      if (allLines.length > 0) {
        allLines.push(""); // blank line between messages
      }
      const prefix = msg.role === "user" ? "You: " : msg.role === "agent" ? "Agent: " : "System: ";
      const prefixColor = msg.role === "user" ? "\x1b[38;5;212m" : msg.role === "agent" ? "\x1b[38;5;141m" : "\x1b[38;5;246m";
      const reset = "\x1b[0m";

      if (msg.role === "agent" && msg.content.length > 0) {
        // Render markdown for agent messages
        const md = new Markdown(msg.content, 0, 0, markdownTheme);
        const mdLines = md.render(width);
        // Add prefix to first line only
        if (mdLines.length > 0) {
          const first = prefixColor + prefix + reset + mdLines[0];
          allLines.push(first);
          for (let i = 1; i < mdLines.length; i++) {
            allLines.push(mdLines[i]!);
          }
        }
      } else {
        // Simple text wrapping for user/system messages
        const header = prefixColor + prefix + reset;
        const headerWidth = visibleWidth(prefix);
        const wrapped = wrapText(msg.content, width, headerWidth);
        for (let i = 0; i < wrapped.length; i++) {
          if (i === 0) {
            allLines.push(header + wrapped[i]!);
          } else {
            allLines.push(" ".repeat(headerWidth) + wrapped[i]!);
          }
        }
      }
    }

    this.cachedLines = allLines;
    return allLines;
  }

  /**
   * Returns the visible slice of chat lines for a given height.
   * Scrolls to bottom if offset is beyond content.
   */
  getVisibleLines(height: number): string[] {
    const lines = this.render(this.cachedWidth);
    const maxOffset = Math.max(0, lines.length - height);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const start = this.scrollOffset;
    const visible = lines.slice(start, start + height);
    // Pad to height at the top so messages appear at the bottom
    while (visible.length < height) {
      visible.unshift(" ");
    }
    return visible;
  }
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
