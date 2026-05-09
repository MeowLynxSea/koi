/**
 * Pending Area Component
 *
 * Displays queued (followUp) and sheer (steer) messages above the input box.
 * Each message has its own cancel (×) button on the right side.
 */

import stringWidth from "string-width";

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
  const all: { type: "sheer" | "queued"; text: string; index: number }[] = [
    ...steering.map((t, i) => ({ type: "sheer" as const, text: t, index: i })),
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
