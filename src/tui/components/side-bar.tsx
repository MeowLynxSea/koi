/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info,
 * context usage, cost estimate, MCP servers, and task list.
 */

import { createTextAttributes } from "@opentui/core";
import { getMcpConnections, getMcpStatusSummary } from "../../services/mcp/index.js";
import { VERSION } from "../../config/version.js";

const KOI_LOGO = [
  "██   ███   ███████   ██████",
  "██  ██    ██    ███    ██   ",
  "████      ██  █  ██    ██   ",
  "██  ██    ███    ██    ██   ",
  "██   ███   ███████   ██████",
];

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

const SUBAGENT_STATUS_COLORS: Record<string, string> = {
  running: "#00d9ff",
  completed: "#00ff99",
  failed: "#ff6b6b",
  killed: "#fbbf24",
};

const MONITOR_STATUS_COLORS: Record<string, string> = {
  running: "#00d9ff",
  completed: "#00ff99",
  error: "#ff6b6b",
  killed: "#fbbf24",
};

const MCP_STATUS_COLORS: Record<string, string> = {
  connected: "#00ff99",
  failed: "#ff6b6b",
  disabled: "#fbbf24",
  disconnected: "#6c6c7c",
  pending: "#00d9ff",
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

interface SubagentItem {
  id: string;
  description: string;
  status: "running" | "completed" | "failed" | "killed";
}

interface MonitorItem {
  id: string;
  description: string;
  status: "running" | "completed" | "killed" | "error" | "detached";
  lastOutput?: string;
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
  subagents?: SubagentItem[];
  monitors?: MonitorItem[];
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
  subagents = [],
  monitors = [],
}: SideBarProps) {
  const usableWidth = Math.max(1, width - 1);

  const visibleTasks = tasks.slice(0, 12);
  const hasMoreTasks = tasks.length > visibleTasks.length;

  const visibleSubagents = subagents.slice(0, 8);
  const hasMoreSubagents = subagents.length > visibleSubagents.length;

  const visibleMonitors = monitors.slice(0, 8);
  const hasMoreMonitors = monitors.length > visibleMonitors.length;

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

      {/* MCP Servers section - get live data */}
      {(() => {
        const mcpSummary = getMcpStatusSummary();
        const mcpConnections = getMcpConnections();
        if (mcpSummary.total === 0) return null;
        return (
          <>
            <text> </text>
            <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">
              MCP ({mcpSummary.connected}/{mcpSummary.total})
            </text>
            {Array.from(mcpConnections.entries()).map(([name, connection]) => {
              const color = MCP_STATUS_COLORS[connection.status] ?? "#6c6c7c";
              return (
                <box key={name} flexDirection="row" gap={1}>
                  <text fg={color}>●</text>
                  <FixedWidthText
                    text={name}
                    width={Math.max(1, usableWidth - 4)}
                    fg="#8a9aaa"
                  />
                </box>
              );
            })}
          </>
        );
      })()}

      {/* Subagents section */}
      {visibleSubagents.length > 0 && (
        <>
          <text> </text>
          <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">
            Subagents ({subagents.length})
          </text>
          {visibleSubagents.map((sa) => {
            const color = SUBAGENT_STATUS_COLORS[sa.status] ?? "#fbbf24";
            return (
              <box key={sa.id} flexDirection="row" gap={1}>
                <text fg={color}>●</text>
                <FixedWidthText
                  text={sa.description}
                  width={Math.max(1, usableWidth - 4)}
                  fg="#8a9aaa"
                />
              </box>
            );
          })}
          {hasMoreSubagents && (
            <text fg="#9aa5b0">
              {`… and ${subagents.length - visibleSubagents.length} more`}
            </text>
          )}
        </>
      )}

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

      {/* Monitors section */}
      {visibleMonitors.length > 0 && (
        <>
          <text> </text>
          <text attributes={createTextAttributes({ bold: true })} fg="#5a6a7a">
            Monitors ({monitors.length})
          </text>
          {visibleMonitors.map((mon) => {
            const color = MONITOR_STATUS_COLORS[mon.status] ?? "#fbbf24";
            const displayText = mon.lastOutput
              ? `${mon.description}: ${mon.lastOutput.slice(0, 20)}`
              : mon.description;
            return (
              <box key={mon.id} flexDirection="row" gap={1}>
                <text fg={color}>●</text>
                <FixedWidthText
                  text={displayText}
                  width={Math.max(1, usableWidth - 4)}
                  fg="#8a9aaa"
                />
              </box>
            );
          })}
          {hasMoreMonitors && (
            <text fg="#9aa5b0">
              {`… and ${monitors.length - visibleMonitors.length} more`}
            </text>
          )}
        </>
      )}
    </box>
  );
}
