/**
 * TUI Theme Configuration
 *
 * Color tokens, border styles, and semantic mappings.
 */

import chalk from "chalk";

// ─── Base Colors ───

export const borderColor = chalk.hex("#4a4a5a");
export const dimText = chalk.hex("#6c6c7c");
export const highlightText = chalk.hex("#ff79c6");
export const agentPrefixColor = chalk.hex("#ff79c6").bold;

// ─── Gradient: Pink → Purple ───
// Crush-style gradient for the logo

const gradientStops = [
  "#00f5ff", // bright cyan
  "#00d9ff",
  "#00bdff",
  "#00ffcc", // teal
  "#00ff99", // green
];

export function gradientPinkPurple(text: string, rowIndex: number, totalRows: number): string {
  if (totalRows <= 1) return chalk.hex(gradientStops[0]!)(text);
  const t = rowIndex / (totalRows - 1);
  const idx = Math.min(Math.floor(t * (gradientStops.length - 1)), gradientStops.length - 2);
  const localT = t * (gradientStops.length - 1) - idx;
  const stop1 = gradientStops[idx]!;
  const stop2 = gradientStops[idx + 1]!;
  const c1 = hexToRgb(stop1);
  const c2 = hexToRgb(stop2);
  const r = Math.round(c1.r + (c2.r - c1.r) * localT);
  const g = Math.round(c1.g + (c2.g - c1.g) * localT);
  const b = Math.round(c1.b + (c2.b - c1.b) * localT);
  return chalk.rgb(r, g, b)(text);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// ─── Sidebar specific helpers ───

export function sidebarTitle(text: string): string {
  return chalk.hex("#00f5ff").bold(text);
}

export function sidebarVersion(text: string): string {
  return chalk.hex("#00ff99")(text);
}

export function sidebarModelName(text: string): string {
  return chalk.hex("#00d9ff")(text);
}

export function sidebarDim(text: string): string {
  return chalk.hex("#0096c7")(text);
}
