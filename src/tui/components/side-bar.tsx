/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info.
 */

import React from "react";
import { createTextAttributes } from "@opentui/core";

const KOI_LOGO = [
  "██   ██   ███████    ███████",
  "██  ██   ██     ██     ███  ",
  "████     ██     ██     ███  ",
  "██  ██   ██     ██     ███  ",
  "██   ██   ███████    ███████",
];

const VERSION = "v0.1.0";

const GRADIENT_STOPS = [
  "#00f5ff",
  "#00d9ff",
  "#00bdff",
  "#00ffcc",
  "#00ff99",
];

interface SideBarProps {
  width?: number;
  workingDir?: string;
  sessionTitle?: string;
  modelName?: string;
  provider?: string;
  contextUsage?: string;
  tokenCount?: string;
  cost?: string;
}

export function SideBar({
  width = 28,
  workingDir = "/",
  sessionTitle = "New Session",
  modelName = "MiniMax-M2.7-highspeed",
  provider = "via MiniMax China",
  contextUsage = "0%",
  tokenCount = "(61)",
  cost = "$0.00",
}: SideBarProps) {
  return (
    <box width={width} flexDirection="column" paddingLeft={1}>
      {/* Row 0: Meowdream™ (left) + version (right) */}
      <box width={width - 1} flexDirection="row" justifyContent="space-between">
        <text attributes={createTextAttributes({ bold: true })} fg="#00f5ff">Meowdream™</text>
        <text fg="#00ff99">{VERSION}</text>
      </box>

      {/* Spacer between header and logo */}
      <text> </text>

      {/* Rows 1-5: KOI ASCII logo with gradient */}
      {KOI_LOGO.map((line, i) => {
        const color = GRADIENT_STOPS[Math.min(i, GRADIENT_STOPS.length - 1)];
        return (
          <text key={i} fg={color} wrapMode="none" truncate={true}>
            {line.slice(0, width - 1)}
          </text>
        );
      })}

      {/* Empty row */}
      <text> </text>

      {/* Session title */}
      <text attributes={createTextAttributes({ bold: true })} fg="#00d9ff">{sessionTitle}</text>

      {/* Working directory */}
      <text fg="#0096c7">{workingDir}</text>

      {/* Empty row */}
      <text> </text>

      {/* Model name */}
      <text attributes={createTextAttributes({ bold: true })} fg="#00d9ff">{modelName}</text>

      {/* Provider */}
      <text fg="#0096c7">{provider}</text>

      {/* Context usage */}
      <text fg="#0096c7">{`${contextUsage} ${tokenCount} ${cost}`}</text>
    </box>
  );
}
