/**
 * CCE Control Panel Modal
 *
 * Displays CCE status and provides actions:
 * - Enable / Disable CCE (global setting)
 * - Start/Stop Web UI
 * - Sync Now (full project scan)
 * - Dream Consolidate
 * - Rebuild Search Index
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createTextAttributes } from "@opentui/core";
import type { MouseEvent } from "@opentui/core";
import { useCceServer } from "./useCceServer.js";

interface CceModalProps {
  isActive: boolean;
  onClose: () => void;
}

type CceStatus = "disabled" | "initializing" | "enabled";

export function CceModal({ isActive, onClose }: CceModalProps) {
  const { width, height } = useTerminalDimensions();
  const { state: serverState, start, stop } = useCceServer();
  const [status, setStatus] = useState<CceStatus>("disabled");
  const [initMsg, setInitMsg] = useState("");
  const [namespace, setNamespace] = useState("-");
  const [wmSlots, setWmSlots] = useState(0);
  const [wmCapacity] = useState(12);
  const [lastSync, setLastSync] = useState("Never");
  const [statusMsg, setStatusMsg] = useState("");
  const cancelledRef = useRef(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    file: string;
    progress: number;
    loaded: number;
    total: number;
    speed: number;
  } | null>(null);

  // Check current status on mount
  useEffect(() => {
    void (async () => {
      const [{ isCceEnabled }, { isCceSystemReady }] = await Promise.all([
        import("../../../config/settings.js"),
        import("../../../cce/index.js"),
      ]);
      if (isCceEnabled() && isCceSystemReady()) {
        setStatus("enabled");
      } else if (isCceEnabled()) {
        // Enabled in settings but not yet initialized — rare, treat as disabled
        setStatus("disabled");
      } else {
        setStatus("disabled");
      }
    })();

    import("../../../cce/agent-bridge/namespace-context.js")
      .then(({ getNamespaceContext }) => {
        setNamespace(getNamespaceContext().current);
      })
      .catch(() => setNamespace("error"));
  }, []);

  // Poll WM slots when enabled
  useEffect(() => {
    if (status !== "enabled") return;
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
            setWmSlots(pool.slots.length);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  const handleEnable = useCallback(async () => {
    cancelledRef.current = false;
    setStatus("initializing");
    setInitMsg("Starting CCE...");
    setDownloadProgress(null);
    try {
      const { setCceEnabled } = await import("../../../config/settings.js");
      const { initCceSystem, startCceServices } = await import("../../../cce/index.js");

      setCceEnabled(true);
      await initCceSystem(
        (msg) => {
          if (!cancelledRef.current) setInitMsg(msg);
        },
        (p) => {
          if (!cancelledRef.current) setDownloadProgress(p);
        },
      );
      if (cancelledRef.current) return;
      startCceServices();
      if (cancelledRef.current) return;
      setStatus("enabled");
      setInitMsg("");
      setDownloadProgress(null);
      setStatusMsg("CCE enabled. Background sync is active.");
    } catch (err) {
      if (cancelledRef.current) return;
      try {
        const { resetCceSystem } = await import("../../../cce/index.js");
        resetCceSystem();
      } catch { /* ignore cleanup errors */ }
      setStatus("disabled");
      setInitMsg("");
      setDownloadProgress(null);
      setStatusMsg(`Enable failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleDisable = useCallback(async () => {
    cancelledRef.current = true;
    try {
      const { setCceEnabled } = await import("../../../config/settings.js");
      const { resetCceSystem } = await import("../../../cce/index.js");
      setCceEnabled(false);
      resetCceSystem();
      setStatus("disabled");
      setInitMsg("");
      setDownloadProgress(null);
      setStatusMsg("CCE disabled.");
      setWmSlots(0);
      setLastSync("Never");
    } catch (err) {
      setStatusMsg(`Disable failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setStatusMsg("Syncing...");
    try {
      const { getNamespaceContext } = await import("../../../cce/agent-bridge/namespace-context.js");
      const { getCceSystem } = await import("../../../cce/index.js");
      const ns = getNamespaceContext().current;
      const cce = getCceSystem();
      if (!cce) throw new Error("CCE not initialized");
      const result = await cce.sync.syncProject(ns, process.cwd(), "smart");
      setLastSync(new Date().toLocaleTimeString());
      setStatusMsg(`Synced: ${result.files_scanned} files, ${result.code_nodes} code nodes`);
    } catch (err) {
      setStatusMsg(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleDream = useCallback(async () => {
    setStatusMsg("Dreaming...");
    try {
      const { getNamespaceContext } = await import("../../../cce/agent-bridge/namespace-context.js");
      const { getCceSystem } = await import("../../../cce/index.js");
      const ns = getNamespaceContext().current;
      const cce = getCceSystem();
      if (!cce) throw new Error("CCE not initialized");
      const stats = await cce.dream.run(ns);
      setStatusMsg(
        `Dream: decayed=${stats['decayed']}, reinforced=${stats['reinforced']}, named=${stats['named']}, deprecated=${stats['deprecated']}`
      );
    } catch (err) {
      setStatusMsg(`Dream failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleRebuildIndex = useCallback(async () => {
    setStatusMsg("Rebuilding index...");
    try {
      const { getCceSystem } = await import("../../../cce/index.js");
      const cce = getCceSystem();
      if (!cce) throw new Error("CCE not initialized");
      await cce.search.rebuildAllSearchDocuments();
      setStatusMsg("Search index rebuilt.");
    } catch (err) {
      setStatusMsg(`Rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.name === "escape") {
      onClose();
    }
  });

  if (!isActive) return null;

  const modalWidth = Math.min(70, Math.max(40, width - 10));
  const modalHeight = Math.max(10, height - 6);

  const statusColor = status === "enabled" ? "#34d399" : status === "initializing" ? "#fbbf24" : "#f87171";
  const statusLabel = status === "enabled" ? "● Enabled" : status === "initializing" ? "◐ Initializing..." : "○ Disabled";

  const handleBackdropClick = (e: MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="#00000080"
      alignItems="center"
      justifyContent="center"
      onMouseUp={handleBackdropClick}
    >
      <box
        flexDirection="column"
        alignSelf="center"
        borderStyle="rounded"
        borderColor="#4a4a5a"
        backgroundColor="#1a1a2e"
        paddingX={2}
        paddingY={1}
        width={modalWidth}
        maxHeight={modalHeight}
        onMouseUp={(e: MouseEvent) => e.stopPropagation()}
      >
      <text alignSelf="center" wrapMode="none" attributes={createTextAttributes({ bold: true })} fg="#60a5fa">
        Cat's Context Engine
      </text>

      {/* Status line */}
      <box flexDirection="row" alignSelf="center" marginTop={1}>
        <text fg={statusColor} attributes={createTextAttributes({ bold: true })}>
          {statusLabel}
        </text>
      </box>

      {/* Init progress */}
      {status === "initializing" && initMsg && (
        <box flexDirection="column" alignSelf="center" marginTop={1} alignItems="center">
          <text fg="#9ca3af">{initMsg}</text>
          {downloadProgress && (
            <>
              <text fg="#8be9fd" wrapMode="none">
                {downloadProgress.file}
              </text>
              {downloadProgress.total > 0 ? (
                <>
                  <text fg="#f8f8f2" wrapMode="none">
                    {"[" + "█".repeat(Math.round((downloadProgress.progress / 100) * 28)) + "░".repeat(28 - Math.round((downloadProgress.progress / 100) * 28)) + "] " + downloadProgress.progress.toFixed(1) + "%"}
                  </text>
                  <text fg="#9ca3af" wrapMode="none">
                    {(() => {
                      const formatBytes = (bytes: number) => {
                        if (bytes === 0) return "0 B";
                        const k = 1024;
                        const sizes = ["B", "KB", "MB", "GB"];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
                      };
                      return formatBytes(downloadProgress.loaded) + " / " + formatBytes(downloadProgress.total) + " @ " + formatBytes(downloadProgress.speed) + "/s";
                    })()}
                  </text>
                </>
              ) : (
                <text fg="#9ca3af" wrapMode="none">
                  {(() => {
                    const formatBytes = (bytes: number) => {
                      if (bytes === 0) return "0 B";
                      const k = 1024;
                      const sizes = ["B", "KB", "MB", "GB"];
                      const i = Math.floor(Math.log(bytes) / Math.log(k));
                      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
                    };
                    return downloadProgress.loaded > 0
                      ? formatBytes(downloadProgress.loaded) + " @ " + formatBytes(downloadProgress.speed) + "/s"
                      : "Downloading...";
                  })()}
                </text>
              )}
            </>
          )}
        </box>
      )}

      {/* Enable / Disable button */}
      <box flexDirection="row" gap={2} alignSelf="center" marginTop={1}>
        {status === "disabled" ? (
          <box paddingX={2} paddingY={0} backgroundColor="#2dd4bf" onMouseUp={handleEnable}>
            <text fg="white" attributes={createTextAttributes({ bold: true })}>Enable CCE</text>
          </box>
        ) : (
          <box paddingX={2} paddingY={0} backgroundColor="#f43f5e" onMouseUp={handleDisable}>
            <text fg="white" attributes={createTextAttributes({ bold: true })}>Disable CCE</text>
          </box>
        )}
      </box>

      {/* Info & actions — only when enabled */}
      {status === "enabled" && (
        <>
          <box flexDirection="column" gap={1} marginTop={1}>
            <text><span fg="#f8f8f2">Namespace: </span><span fg="#8be9fd">{namespace}</span></text>
            <text><span fg="#f8f8f2">Working Memory: </span><span fg="#8be9fd">{String(wmSlots)}/{String(wmCapacity)}</span><span fg="#f8f8f2"> slots</span></text>
            <text><span fg="#f8f8f2">Last Sync: </span><span fg="#8be9fd">{lastSync}</span></text>
            {serverState.url && (
              <text><span fg="#f8f8f2">Web UI: </span><span fg="#2dd4bf">{serverState.url}</span></text>
            )}
          </box>

          <box flexDirection="row" gap={2} marginTop={1} flexWrap="wrap">
            <box paddingX={2} paddingY={0} backgroundColor={serverState.running ? "#f43f5e" : "#2dd4bf"} onMouseUp={serverState.running ? stop : start}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>
                {serverState.running ? "Stop Web" : "Start Web"}
              </text>
            </box>
            <box paddingX={2} paddingY={0} backgroundColor="#3b82f6" onMouseUp={handleSync}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>Sync Now</text>
            </box>
            <box paddingX={2} paddingY={0} backgroundColor="#8b5cf6" onMouseUp={handleDream}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>Dream</text>
            </box>
            <box paddingX={2} paddingY={0} backgroundColor="#f59e0b" onMouseUp={handleRebuildIndex}>
              <text fg="white" attributes={createTextAttributes({ bold: true })}>Rebuild</text>
            </box>
          </box>
        </>
      )}

      {statusMsg && (
        <box marginTop={1}>
          <text fg="#a5b4fc">{statusMsg}</text>
        </box>
      )}

      {serverState.error && (
        <box marginTop={1}>
          <text fg="#f43f5e">Error: {serverState.error}</text>
        </box>
      )}

      <box alignSelf="center" marginTop={1}>
        <text fg="#6c6c7c" attributes={createTextAttributes({ dim: true })}>
          Press Esc or click outside to close
        </text>
      </box>
    </box>
    </box>
  );
}
