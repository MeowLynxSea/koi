/**
 * Monitor Registry — 后台监控任务管理器
 *
 * Manages background process monitors that watch command output and notify
 * the main agent when changes occur.
 *
 * Notification delivery:
 *   - Main agent busy → steer() to insert notification
 *   - Main agent idle → prompt() to trigger a new run
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { activeSessionRef } from "./hooks.js";

export type MonitorStatus = "running" | "completed" | "killed" | "error";

export interface MonitorEntry {
  id: string;
  description: string;
  command: string;
  status: MonitorStatus;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  outputLines: string[];
  lastOutput?: string;
  error?: string;
}

type MonitorListener = (entries: MonitorEntry[]) => void;

/**
 * Creates a monitor notification XML tag for internal LLM communication.
 * These tags are filtered out of the UI but visible to the agent.
 */
function createMonitorNotification(
  monitorId: string,
  type: "output" | "completed" | "error",
  payload: string
): string {
  return `<monitor-notification>\n  <monitor-id>${monitorId}</monitor-id>\n  <type>${type}</type>\n  <payload>${escapeXml(payload)}</payload>\n</monitor-notification>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a unique monitor ID.
 */
function generateMonitorId(): string {
  return `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class MonitorRegistryImpl extends EventEmitter {
  private monitors = new Map<string, MonitorEntry>();
  private processes = new Map<string, ChildProcess>();

  /**
   * Launch a new background monitor.
   * Returns the monitor ID.
   */
  launch(command: string, description: string = ""): string {
    const id = generateMonitorId();

    const entry: MonitorEntry = {
      id,
      description: description || `Monitor: ${command.slice(0, 40)}${command.length > 40 ? "…" : ""}`,
      command,
      status: "running",
      startTime: Date.now(),
      outputLines: [],
    };

    this.monitors.set(id, entry);
    this.emit("change", this.getAll());

    // Spawn the background process
    const child = spawn("bash", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false, // Keep in same process group so we can kill it
    });

    this.processes.set(id, child);

    let stderrBuffer = "";

    // Capture stdout line by line
    child.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (!line && lines.length === 1) continue; // Skip empty lines from partial chunks
        const trimmed = line.trimEnd();
        if (!trimmed) continue;

        const monitor = this.monitors.get(id);
        if (monitor) {
          monitor.outputLines.push(trimmed);
          monitor.lastOutput = trimmed;
        }

        const notification = createMonitorNotification(id, "output", trimmed);
        this.notifyParent(notification);
        this.emit("change", this.getAll());
      }
    });

    // Capture stderr
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    // Handle process exit
    child.on("close", (code: number | null) => {
      this.processes.delete(id);

      const monitor = this.monitors.get(id);
      if (!monitor) return;

      if (stderrBuffer.trim()) {
        monitor.error = stderrBuffer.trim();
        const notification = createMonitorNotification(id, "error", stderrBuffer.trim());
        this.notifyParent(notification);
      }

      if (monitor.status === "running") {
        monitor.status = code === 0 ? "completed" : "error";
        monitor.exitCode = code ?? undefined;
        monitor.endTime = Date.now();

        const notification = createMonitorNotification(
          id,
          "completed",
          `Exited with code ${code ?? "unknown"}`
        );
        this.notifyParent(notification);
      }

      this.emit("change", this.getAll());
    });

    child.on("error", (err: Error) => {
      this.processes.delete(id);

      const monitor = this.monitors.get(id);
      if (monitor) {
        monitor.status = "error";
        monitor.error = err.message;
        monitor.endTime = Date.now();

        const notification = createMonitorNotification(id, "error", err.message);
        this.notifyParent(notification);
      }

      this.emit("change", this.getAll());
    });

    return id;
  }

  /**
   * Cancel a running monitor by killing its process.
   * Returns true if the monitor was found and killed.
   */
  kill(id: string): boolean {
    const child = this.processes.get(id);
    if (!child) return false;

    try {
      // Kill the process group to ensure child processes are also terminated
      process.kill(child.pid!, "SIGTERM");

      // Give it a moment to clean up gracefully
      setTimeout(() => {
        const monitor = this.monitors.get(id);
        if (monitor && monitor.status === "running") {
          try {
            process.kill(child.pid!, 0); // Check if still alive
          } catch {
            // Process already dead, already handled by 'close' event
            return;
          }
          // Force kill if still alive
          try {
            process.kill(child.pid!, "SIGKILL");
          } catch {
            // ignore
          }
        }
      }, 500);
    } catch {
      // Process might have already exited
    }

    const monitor = this.monitors.get(id);
    if (monitor) {
      monitor.status = "killed";
      monitor.endTime = Date.now();
      this.emit("change", this.getAll());
    }

    return true;
  }

  /**
   * Get a single monitor entry by ID.
   */
  get(id: string): MonitorEntry | undefined {
    return this.monitors.get(id);
  }

  /**
   * Get all monitor entries.
   */
  getAll(): MonitorEntry[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get only running monitors.
   */
  getRunning(): MonitorEntry[] {
    return this.getAll().filter((m) => m.status === "running");
  }

  /**
   * Subscribe to monitor registry changes.
   */
  subscribe(listener: MonitorListener): () => void {
    this.on("change", listener);
    return () => this.off("change", listener);
  }

  /**
   * Remove a monitor from the registry.
   * Does not kill the process if it's still running.
   */
  remove(id: string): boolean {
    const existed = this.monitors.has(id);
    this.monitors.delete(id);
    if (existed) this.emit("change", this.getAll());
    return existed;
  }

  /**
   * Clear all monitors.
   */
  clear(): void {
    for (const [id, child] of this.processes) {
      try {
        process.kill(child.pid!, "SIGTERM");
      } catch {
        // ignore
      }
      this.monitors.delete(id);
    }
    this.processes.clear();
    this.monitors.clear();
    this.emit("change", this.getAll());
  }

  /**
   * Notify the parent agent session of a monitor event.
   * Uses steer() if the agent is busy, prompt() if idle.
   */
  private notifyParent(notification: string): void {
    const parent = activeSessionRef.current;
    if (!parent) {
      console.warn("[MonitorRegistry] No active session to notify");
      return;
    }

    if (parent.isStreaming) {
      parent.steer(notification).catch(() => {
        // Silently ignore if the parent session is no longer available
      });
    } else {
      parent.prompt(notification).catch(() => {
        // Silently ignore if the parent session is no longer available
      });
    }
  }
}

// Global singleton
export const monitorRegistry = new MonitorRegistryImpl();
