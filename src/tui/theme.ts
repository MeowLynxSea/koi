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

// ─── 水墨风渐变 ───
// 从淡墨到浓墨的渐变色

const gradientStops = [
  "#8fbc8f", // 淡石绿（远山）
  "#708090", // 石板灰（主色调）
  "#5a6a7a", // 中墨色
  "#4a5a6a", // 浓墨
  "#3a4a5a", // 最深墨色
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

// ─── Sidebar 水墨风配色 ───

export function sidebarTitle(text: string): string {
  return chalk.hex("#5a6a7a").bold(text);
}

export function sidebarVersion(text: string): string {
  return chalk.hex("#7a8a9a")(text);
}

export function sidebarModelName(text: string): string {
  return chalk.hex("#5a6a7a")(text);
}

export function sidebarDim(text: string): string {
  return chalk.hex("#8a9aaa")(text);
}
