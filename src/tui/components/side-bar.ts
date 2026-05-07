/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info.
 */

import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { gradientPinkPurple, sidebarTitle, sidebarVersion, sidebarModelName, sidebarDim } from "../theme.js";

const KOI_LOGO = [
  "██   ██   ███████    ███████",
  "██  ██   ██     ██     ███  ",
  "████     ██     ██     ███  ",
  "██  ██   ██     ██     ███  ",
  "██   ██   ███████    ███████",
];

const VERSION = "v0.1.0";

export class SideBar implements Component {
  private sessionTitle = "New Session";
  private workingDir = "/";
  private modelName = "MiniMax-M2.7-highspeed";
  private provider = "via MiniMax China";
  private contextUsage = "0%";
  private tokenCount = "(61)";
  private cost = "$0.00";

  setSessionTitle(title: string): void {
    this.sessionTitle = title;
  }

  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  setModelInfo(name: string, provider: string, usage: string, tokens: string, cost: string): void {
    this.modelName = name;
    this.provider = provider;
    this.contextUsage = usage;
    this.tokenCount = tokens;
    this.cost = cost;
  }

  invalidate(): void {
    // state-driven, no cache
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Row 0: Meowdream™ (left) + version (right)
    const title = "Meowdream™";
    const version = VERSION;
    const headerGap = Math.max(0, width - title.length - version.length);
    lines.push(sidebarTitle(title) + " ".repeat(headerGap) + sidebarVersion(version));

    // Rows 1-7: KOI ASCII logo with gradient
    for (let i = 0; i < KOI_LOGO.length; i++) {
      const raw = truncateToWidth(KOI_LOGO[i]!, width, "", true);
      lines.push(gradientPinkPurple(raw, i, KOI_LOGO.length));
    }

    // Row 8: empty
    lines.push(" ".repeat(width));

    // Row 9: session title
    lines.push(sidebarModelName(truncateToWidth(this.sessionTitle, width, "", true)));

    // Row 10: working directory
    lines.push(sidebarDim(truncateToWidth(this.workingDir, width, "", true)));

    // Row 11: empty
    lines.push(" ".repeat(width));

    // Row 12: model name
    lines.push(sidebarModelName(truncateToWidth(this.modelName, width, "", true)));

    // Row 13: provider
    lines.push(sidebarDim(truncateToWidth(this.provider, width, "", true)));

    // Row 14: context usage + tokens + cost
    const usageLine = `${this.contextUsage} ${this.tokenCount} ${this.cost}`;
    lines.push(sidebarDim(truncateToWidth(usageLine, width, "", true)));

    return lines;
  }
}
