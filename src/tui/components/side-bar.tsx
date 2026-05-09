/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info,
 * context usage, cost estimate, and task list.
 */

import { createTextAttributes } from "@opentui/core";

const KOI_LOGO = [
  "██   ██   ███████   ███████",
  "██  ██   ██    ███    ███   ",
  "████     ██  █  ██    ███   ",
  "██  ██   ███    ██    ███   ",
  "██   ██   ███████   ███████",
];

const VERSION = "v0.1.0";

// 水墨风格渐变色：从淡蓝墨到浓墨
const GRADIENT_STOPS = [
  "#778899", // 淡蓝灰（偏向蓝色）
  "#708090", // 石板灰（主色调）
  "#5a6a7a", // 中墨色
  "#4a5a6a", // 浓墨
  "#3a4a5a", // 最深墨色
];

function abbreviatePath(path: string, maxLen: number = 24): string {
  if (path.length <= maxLen) return path;
  if (path === "/" || path === "~") return path;

  const prefix = path.startsWith("~") ? "~" : "";
  const cleanPath = path.startsWith("~") ? path.slice(1) : path;
  const parts = cleanPath.split("/").filter(Boolean);

  if (parts.length <= 1) {
    return path.length > maxLen ? path.slice(0, maxLen - 1) + "…" : path;
  }

  // Try keeping tail segments intact, drop leading ones
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join("/");
    const candidate = prefix ? `${prefix}/${tail}` : `/${tail}`;
    if (candidate.length <= maxLen) {
      return candidate;
    }
  }

  // Even the last segment is too long — truncate it
  const last = parts[parts.length - 1]!;
  const abbreviatedLast =
    last.length > maxLen - 4 ? last.slice(0, maxLen - 4) + "…" : last;
  return prefix ? `${prefix}/…/${abbreviatedLast}` : `/…/${abbreviatedLast}`;
}

function FixedWidthText({
  text,
  width,
  fg,
}: {
  text: string;
  width: number;
  fg?: string;
}) {
  const display = text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + "…";
  return (
    <box width={width}>
      <text fg={fg}>{display}</text>
    </box>
  );
}

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "#fbbf24",
  in_progress: "#00d9ff",
  completed: "#00ff99",
};

function Divider({
  width,
  char = "─",
  fg: color = "#9aabb8",
}: {
  width: number;
  char?: string;
  fg?: string;
}) {
  const pattern = char.repeat(width + 1);
  return (
    <text fg={color} wrapMode="none" truncate={true}>
      {pattern.slice(0, width)}
    </text>
  );
}

interface TaskItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface SideBarProps {
  width?: number;
  workingDir?: string;
  sessionTitle?: string;
  modelName?: string;
  provider?: string;
  contextUsage?: string;
  tokenCount?: string;
  cost?: string;
  tasks?: TaskItem[];
}

export function SideBar({
  width = 28,
  workingDir = "/",
  sessionTitle = "New Session",
  modelName = "Not configured",
  provider = "Use /model to select",
  contextUsage = "0%",
  tokenCount = "(0)",
  cost = "$0.00",
  tasks = [],
}: SideBarProps) {
  const usableWidth = Math.max(1, width - 1);

  const visibleTasks = tasks.slice(0, 12);
  const hasMoreTasks = tasks.length > visibleTasks.length;

  return (
    <box width={width} flexDirection="column" paddingLeft={1}>
      {/* Top spacer */}
      <text> </text>

      {/* Row 0: Meowdream (left) + version (right) */}
      <box width={usableWidth} flexDirection="row" justifyContent="space-between">
        <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">Meowdream</text>
        <text fg="#7a8a9a">{VERSION}</text>
      </box>

      {/* Spacer between header and logo */}
      <text> </text>

      {/* Divider above logo */}
      <Divider width={usableWidth} />
      <Divider width={usableWidth} char="·" fg="#c5cdd5" />

      {/* Rows 1-5: KOI ASCII logo with gradient */}
      {KOI_LOGO.map((line, i) => {
        const color = GRADIENT_STOPS[Math.min(i, GRADIENT_STOPS.length - 1)];
        return (
          <text key={i} fg={color} wrapMode="none" truncate={true}>
            {line.slice(0, usableWidth)}
          </text>
        );
      })}

      {/* Divider below logo */}
      <Divider width={usableWidth} char="·" fg="#c5cdd5" />
      <Divider width={usableWidth} />

      {/* Spacer */}
      <text> </text>

      {/* Session title */}
      <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">{sessionTitle}</text>

      {/* Spacer between session title and directory */}
      <text> </text>

      {/* Working directory */}
      <text fg="#8a9aaa">{abbreviatePath(workingDir, usableWidth)}</text>

      {/* Empty row */}
      <text> </text>

      {/* Model name */}
      <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">{modelName}</text>

      {/* Provider */}
      <text fg="#8a9aaa">{provider}</text>

      {/* Context usage + cost */}
      <text fg="#8a9aaa">{`${contextUsage} ${tokenCount} ${cost}`}</text>

      {/* Tasks section */}
      {visibleTasks.length > 0 && (
        <>
          <text> </text>
          <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">
            Tasks ({tasks.length})
          </text>
          {visibleTasks.map((task) => {
            const color = TASK_STATUS_COLORS[task.status] ?? "#fbbf24";
            return (
              <box key={task.id} flexDirection="row" gap={1}>
                <text fg={color}>●</text>
                <FixedWidthText
                  text={task.content}
                  width={Math.max(1, usableWidth - 4)}
                  fg="#8a9aaa"
                />
              </box>
            );
          })}
          {hasMoreTasks && (
            <text fg="#9aa5b0">
              {`… and ${tasks.length - visibleTasks.length} more`}
            </text>
          )}
        </>
      )}
    </box>
  );
}
