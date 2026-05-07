/**
 * TUI Application Framework
 *
 * Orchestrates the terminal UI: layout manager, focus management,
 * event routing, and the main render loop.
 */

import type { Terminal } from "@mariozechner/pi-tui";
import { TUI, type Component, visibleWidth } from "@mariozechner/pi-tui";
import { ChatPanel } from "./components/chat-panel.js";
import { InputBox } from "./components/input-box.js";
import { InfoBar } from "./components/info-bar.js";
import { SideBar } from "./components/side-bar.js";
import { borderColor } from "./theme.js";

const SIDEBAR_WIDTH = 28;
const DIVIDER = "│ ";
const DIVIDER_WIDTH = 2;

export class KoiApp implements Component {
  private terminal: Terminal;
  private tui: TUI;
  private chatPanel: ChatPanel;
  private inputBox: InputBox;
  private infoBar: InfoBar;
  private sideBar: SideBar;

  constructor(terminal: Terminal, tui: TUI) {
    this.terminal = terminal;
    this.tui = tui;
    this.chatPanel = new ChatPanel();
    this.inputBox = new InputBox(tui);
    this.infoBar = new InfoBar(tui);
    this.sideBar = new SideBar();

    // Set up working directory
    this.sideBar.setWorkingDir(process.cwd());

    // Handle submit
    this.inputBox.onSubmit = (text) => {
      if (text.trim()) {
        this.chatPanel.addMessage("user", text);
        this.chatPanel.scrollToBottom();
        this.inputBox.setText("");
        this.tui.requestRender();
      }
    };

    // Start info bar scrolling
    this.infoBar.startScrolling();
  }

  getEditor(): InputBox {
    return this.inputBox;
  }

  getChatPanel(): ChatPanel {
    return this.chatPanel;
  }

  getSideBar(): SideBar {
    return this.sideBar;
  }

  getInfoBar(): InfoBar {
    return this.infoBar;
  }

  invalidate(): void {
    this.chatPanel.invalidate();
    this.inputBox.invalidate();
    this.infoBar.invalidate();
    this.sideBar.invalidate();
  }

  render(width: number): string[] {
    const height = this.terminal.rows;
    const leftWidth = Math.max(1, width - SIDEBAR_WIDTH - DIVIDER_WIDTH);

    // Render input box first to know its dynamic height (autocomplete may expand)
    const inputLines = this.inputBox.render(leftWidth);
    const inputHeight = inputLines.length;

    // Bottom area = input box + info bar
    const bottomHeight = inputHeight + 1;
    const chatHeight = Math.max(0, height - bottomHeight);

    // Get visible chat lines
    const chatLines = this.chatPanel.getVisibleLines(chatHeight);

    // Info bar is exactly 1 line
    const infoLines = this.infoBar.render(leftWidth);

    // Assemble left side: chat + input + info
    const leftLines: string[] = [];
    leftLines.push(...chatLines);
    leftLines.push(...inputLines);
    leftLines.push(...infoLines);

    // Render sidebar to full height
    const sideLinesRaw = this.sideBar.render(SIDEBAR_WIDTH);
    const sideLines: string[] = [];
    for (let i = 0; i < height; i++) {
      if (i < sideLinesRaw.length) {
        sideLines.push(sideLinesRaw[i]!);
      } else {
        sideLines.push(" ".repeat(SIDEBAR_WIDTH));
      }
    }

    // Horizontal composition
    const lines: string[] = [];
    for (let i = 0; i < height; i++) {
      const left = leftLines[i] ?? " ".repeat(leftWidth);
      // Ensure left is padded to leftWidth
      const leftPadded = padLine(left, leftWidth);
      const right = sideLines[i] ?? " ".repeat(SIDEBAR_WIDTH);
      lines.push(leftPadded + borderColor(DIVIDER) + right);
    }

    return lines;
  }
}

function padLine(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w >= width) return line;
  return line + " ".repeat(width - w);
}
