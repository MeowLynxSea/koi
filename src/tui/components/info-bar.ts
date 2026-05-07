/**
 * Info Bar Component
 *
 * Persistent footer line: scrolling keybinding hints on the left,
 * empty space on the right reserved for the koi pet.
 */

import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";
import { dimText } from "../theme.js";

const HINT_TEXT = "Ctrl+S Send  Ctrl+N New Session  Ctrl+Y Yank  Ctrl+P Paste  ↑↓ History  Esc Cancel";
const EXIT_TEXT = "Press Ctrl+C again to exit";
const SCROLL_INTERVAL_MS = 300;
const MAX_HINT_WIDTH_RATIO = 0.6; // max 60% of width for hints

export class InfoBar implements Component {
  private scrollOffset = 0;
  private scrollDirection = 1;
  private scrollTimer: ReturnType<typeof setInterval> | null = null;
  private lastWidth = 80;
  private tui: TUI;
  private exitMode = false;

  constructor(tui: TUI) {
    this.tui = tui;
  }

  setExitMode(active: boolean): void {
    this.exitMode = active;
  }

  startScrolling(): void {
    if (this.scrollTimer) return;
    this.scrollTimer = setInterval(() => {
      if (this.exitMode) return;
      const maxWidth = Math.floor(this.lastWidth * MAX_HINT_WIDTH_RATIO);
      const textWidth = visibleWidth(HINT_TEXT);
      if (textWidth <= maxWidth) return;
      const maxOffset = textWidth - maxWidth;
      this.scrollOffset += this.scrollDirection;
      if (this.scrollOffset >= maxOffset) {
        this.scrollOffset = maxOffset;
        this.scrollDirection = -1;
      } else if (this.scrollOffset <= 0) {
        this.scrollOffset = 0;
        this.scrollDirection = 1;
      }
      this.tui.requestRender();
    }, SCROLL_INTERVAL_MS);
  }

  stopScrolling(): void {
    if (this.scrollTimer) {
      clearInterval(this.scrollTimer);
      this.scrollTimer = null;
    }
  }

  invalidate(): void {
    // no cache
  }

  render(width: number): string[] {
    this.lastWidth = width;

    if (this.exitMode) {
      const line = dimText(truncateToWidth(EXIT_TEXT, width, "", true));
      return [line];
    }

    const maxHintWidth = Math.floor(width * MAX_HINT_WIDTH_RATIO);
    const textWidth = visibleWidth(HINT_TEXT);

    let displayText: string;
    if (textWidth <= maxHintWidth) {
      displayText = HINT_TEXT;
    } else {
      displayText = truncateToWidth(
        HINT_TEXT.slice(this.scrollOffset),
        maxHintWidth,
        "",
        true
      );
    }

    const line = dimText(displayText);
    return [line];
  }
}
