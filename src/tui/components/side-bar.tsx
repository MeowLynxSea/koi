/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info,
 * context usage, cost estimate, and task list.
 */

import React from "react";
import { createTextAttributes } from "@opentui/core";

const KOI_LOGO = [
  "██   ██   ███████   ████████",
  "██  ██   ██     ██    ███   ",
  "████     ██     ██    ███   ",
  "██  ██   ██     ██    ███   ",
  "██   ██   ███████   ████████",
];

const VERSION = "v0.1.0";

const GRADIENT_STOPS = [
  "#00f5ff",
  "#00d9ff",
  "#00bdff",
  "#00ffcc",
  "#00ff99",
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

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)) + "…";
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
  char = "▒",
  fg: color = "#445566",
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
      {/* Row 0: Meowdream™ (left) + version (right) */}
      <box width={usableWidth} flexDirection="row" justifyContent="space-between">
        <text attributes={createTextAttributes({ bold: true })} fg="#00f5ff">Meowdream™</text>
        <text fg="#00ff99">{VERSION}</text>
      </box>

      {/* Spacer between header and logo */}
      <text> </text>

      {/* Divider above logo */}
      <Divider width={usableWidth} />
      <Divider width={usableWidth} char="░" fg="#334455" />

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
      <Divider width={usableWidth} char="░" fg="#334455" />
      <Divider width={usableWidth} />

      {/* Spacer */}
      <text> </text>

      {/* Session title */}
      <text attributes={createTextAttributes({ bold: true })} fg="#00d9ff">{sessionTitle}</text>

      {/* Spacer between session title and directory */}
      <text> </text>

      {/* Working directory */}
      <text fg="#0096c7">{abbreviatePath(workingDir, usableWidth)}</text>

      {/* Empty row */}
      <text> </text>

      {/* Model name */}
      <text attributes={createTextAttributes({ bold: true })} fg="#00d9ff">{modelName}</text>

      {/* Provider */}
      <text fg="#0096c7">{provider}</text>

      {/* Context usage + cost */}
      <text fg="#0096c7">{`${contextUsage} ${tokenCount} ${cost}`}</text>

      {/* Tasks section */}
      {visibleTasks.length > 0 && (
        <>
          <text> </text>
          <text attributes={createTextAttributes({ bold: true })} fg="#00d9ff">
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
                  fg="#a5b4fc"
                />
              </box>
            );
          })}
          {hasMoreTasks && (
            <text fg="#445566">
              {`… and ${tasks.length - visibleTasks.length} more`}
            </text>
          )}
        </>
      )}
    </box>
  );
}
