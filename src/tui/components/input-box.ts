/**
 * Input Box Component
 *
 * Wraps pi-tui's Editor with a fixed 3-line visible height and a mode prefix.
 * The first line starts with "Agent > ", subsequent lines are indented.
 */

import {
  Editor,
  type EditorTheme,
  type TUI,
  CURSOR_MARKER,
  visibleWidth,
} from "@mariozechner/pi-tui";
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { borderColor, agentPrefixColor, dimText } from "../theme.js";

function padToWidth(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w >= width) return line;
  return line + " ".repeat(width - w);
}

const MODE_PREFIX = "Agent > ";

function createEditorTui(tui: TUI): TUI {
  return new Proxy(tui, {
    get(target, prop, receiver) {
      if (prop === "terminal") {
        return new Proxy(target.terminal, {
          get(t, p) {
            if (p === "rows") return 10;
            return Reflect.get(t, p);
          },
        });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export class InputBox implements Component, Focusable {
  focused = false;
  private editor: Editor;
  private tui: TUI;
  private theme: EditorTheme;
  onSubmit?: (text: string) => void;

  constructor(tui: TUI) {
    this.tui = tui;
    this.theme = {
      borderColor,
      selectList: {
        selectedPrefix: dimText,
        selectedText: (s) => s,
        description: dimText,
        scrollInfo: dimText,
        noMatch: dimText,
      },
    };
    const editorTui = createEditorTui(tui);
    this.editor = new Editor(editorTui, this.theme, { paddingX: 0 });
    this.editor.onSubmit = (text) => {
      if (this.onSubmit) this.onSubmit(text);
    };
  }

  getEditor(): Editor {
    return this.editor;
  }

  getText(): string {
    return this.editor.getText();
  }

  setText(text: string): void {
    this.editor.setText(text);
  }

  insertTextAtCursor(text: string): void {
    this.editor.insertTextAtCursor(text);
  }

  handleInput(data: string): void {
    this.editor.handleInput(data);
  }

  invalidate(): void {
    this.editor.invalidate();
  }

  render(width: number): string[] {
    const prefixWidth = visibleWidth(MODE_PREFIX);
    const editorWidth = Math.max(1, width - prefixWidth);
    const rawLines = this.editor.render(editorWidth);

    if (rawLines.length === 0) return rawLines;

    const borders: string[] = [];
    const contentLines: string[] = [];
    const autocompleteLines: string[] = [];
    let seenBottomBorder = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]!;
      // Border lines start with ─ (possibly with ANSI colors) or contain scroll indicators
      const isTopBorder = /^[\x1b\[0-9;]*m?─/.test(line) && !seenBottomBorder && contentLines.length === 0;
      const isBottomBorder = /^[\x1b\[0-9;]*m?─/.test(line) && (contentLines.length > 0 || seenBottomBorder);
      const isScrollIndicator = /─\s*↑\s*\d+\s*more/.test(line) || /─\s*↓\s*\d+\s*more/.test(line);

      if (isTopBorder || isScrollIndicator) {
        borders.push(line);
        continue;
      }
      if (isBottomBorder) {
        borders.push(line);
        seenBottomBorder = true;
        continue;
      }

      if (seenBottomBorder) {
        // Everything after bottom border is autocomplete
        autocompleteLines.push(line);
      } else {
        contentLines.push(line);
      }
    }

    // Pad content to exactly 3 visible lines
    while (contentLines.length < 3) {
      contentLines.push(" ".repeat(editorWidth));
    }

    const result: string[] = [];
    if (borders.length > 0) {
      result.push(padToWidth(borders[0]!, width)); // top border padded to full width
    }

    for (let i = 0; i < 3; i++) {
      const line = contentLines[i]!;
      const prefix = i === 0 ? agentPrefixColor(MODE_PREFIX) : " ".repeat(prefixWidth);
      result.push(prefix + line);
    }

    if (borders.length > 1) {
      result.push(padToWidth(borders[1]!, width)); // bottom border padded to full width
    }
    for (const line of autocompleteLines) {
      result.push(padToWidth(line, width));
    }

    return result;
  }
}
