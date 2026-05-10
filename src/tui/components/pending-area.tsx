/**
 * Pending Area Component
 *
 * Displays queued (followUp) and sheer (steer) messages above the input box.
 * Each message has its own cancel (×) button on the right side.
 */

import stringWidth from "string-width";
import { isInternalNotification } from "../../agent/hooks.js";

interface PendingAreaProps {
  steering: readonly string[];
  followUp: readonly string[];
  width?: number;
  onRemove: (type: "sheer" | "queued", index: number) => void;
  onEdit?: (type: "sheer" | "queued", index: number) => void;
}

function truncateText(text: string, maxWidth: number): string {
  const w = stringWidth(text);
  if (w <= maxWidth) return text;
  let result = "";
  let currentWidth = 0;
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const seg of segmenter.segment(text)) {
    const g = seg.segment;
    const gw = stringWidth(g);
    if (currentWidth + gw + 3 > maxWidth) {
      return result + "...";
    }
    result += g;
    currentWidth += gw;
  }
  return result;
}

export function PendingArea({ steering, followUp, width = 80, onRemove, onEdit }: PendingAreaProps) {
  const contentWidth = Math.max(1, width - 2);

  // Filter out internal subagent task notifications from the steer list.
  // When a background agent completes while the main agent is busy, it sends
  // a <task-notification> via steer(). We don't want to show these in the UI.
  const filteredSteering = steering.filter((t) => !isInternalNotification(t));

  const all: { type: "sheer" | "queued"; text: string; index: number }[] = [
    ...filteredSteering.map((t, i) => ({ type: "sheer" as const, text: t, index: i })),
    ...followUp.map((t, i) => ({ type: "queued" as const, text: t, index: i })),
  ];

  if (all.length === 0) return null;

  const editWidth = onEdit ? stringWidth(" ✎") : 0;
  const lines = all.map((item) => {
    const prefix = item.type === "sheer" ? "[Sheer] " : "[Queued] ";
    const tagWidth = stringWidth(prefix) + stringWidth(" ×") + editWidth;
    return {
      ...item,
      displayText: prefix + truncateText(item.text, Math.max(1, contentWidth - tagWidth)),
    };
  });

  return (
    <box width={width} flexDirection="column" paddingX={1}>
      {lines.map((line) => (
        <box key={`${line.type}-${line.index}`} flexDirection="row" width={contentWidth}>
          <text fg={line.type === "sheer" ? "#ff79c6" : "#8be9fd"}>
            {line.displayText}
          </text>
          <box flexGrow={1} />
          {onEdit && (
            <text
              fg="#fbbf24"
              onMouseUp={() => onEdit(line.type, line.index)}
            >
              {" ✎"}
            </text>
          )}
          <text
            fg="#ff5555"
            onMouseUp={() => onRemove(line.type, line.index)}
          >
            {" ×"}
          </text>
        </box>
      ))}
    </box>
  );
}
