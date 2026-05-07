/**
 * Side Bar Component
 *
 * Right sidebar: Logo, session title, working directory, model info.
 */

import React from "react";
import { Box, Text } from "ink";
import { gradientPinkPurple, sidebarTitle, sidebarVersion, sidebarModelName, sidebarDim } from "../theme.js";
import { truncateToWidth } from "@mariozechner/pi-tui";

const KOI_LOGO = [
  "██   ██   ███████    ███████",
  "██  ██   ██     ██     ███  ",
  "████     ██     ██     ███  ",
  "██  ██   ██     ██     ███  ",
  "██   ██   ███████    ███████",
];

const VERSION = "v0.1.0";

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
    <Box width={width} flexDirection="column" paddingLeft={1}>
      {/* Row 0: Meowdream™ (left) + version (right) */}
      <Box width={width - 1} flexDirection="row" justifyContent="space-between">
        <Text>{sidebarTitle("Meowdream™")}</Text>
        <Text>{sidebarVersion(VERSION)}</Text>
      </Box>

      {/* Rows 1-5: KOI ASCII logo with gradient */}
      {KOI_LOGO.map((line, i) => (
        <Text key={i}>{gradientPinkPurple(truncateToWidth(line, width - 1, "", true), i, KOI_LOGO.length)}</Text>
      ))}

      {/* Empty row */}
      <Text> </Text>

      {/* Session title */}
      <Text>{sidebarModelName(sessionTitle)}</Text>

      {/* Working directory */}
      <Text>{sidebarDim(workingDir)}</Text>

      {/* Empty row */}
      <Text> </Text>

      {/* Model name */}
      <Text>{sidebarModelName(modelName)}</Text>

      {/* Provider */}
      <Text>{sidebarDim(provider)}</Text>

      {/* Context usage */}
      <Text>{sidebarDim(`${contextUsage} ${tokenCount} ${cost}`)}</Text>
    </Box>
  );
}
