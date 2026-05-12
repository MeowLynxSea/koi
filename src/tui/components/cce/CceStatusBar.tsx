/**
 * Small sidebar widget showing CCE Working Memory slot count.
 */

import { useState, useEffect } from "react";
import { createTextAttributes } from "@opentui/core";

interface CceStatusBarProps {
  onClick: () => void;
}

export function CceStatusBar({ onClick }: CceStatusBarProps) {
  const [slotCount, setSlotCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([
        import("../../../cce/agent-bridge/namespace-context.js"),
        import("../../../cce/brain/working-memory.js"),
      ])
        .then(([{ getNamespaceContext }, { getWorkingMemoryManager }]) => {
          const ns = getNamespaceContext().current;
          const wm = getWorkingMemoryManager();
          if (wm) {
            const pool = wm.getPool(ns);
            setSlotCount(pool?.slots.length ?? 0);
          }
        })
        .catch(() => setSlotCount(0));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (slotCount === 0) return null;

  return (
    <box flexDirection="row" gap={1} onMouseUp={onClick}>
      <text fg="#8be9fd" attributes={createTextAttributes({ bold: true })}>
        🧠 CCE
      </text>
      <text fg="#a5b4fc">
        {slotCount} slots
      </text>
    </box>
  );
}
