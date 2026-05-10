/**
 * Monitor Registry — 后台监控任务管理器 (PTY 版本)
 *
 * Manages background process monitors using PTY for full I/O isolation.
 * Supports:
 * - PTY-based execution (full terminal isolation)
 * - Process input via SendToMonitor
 * - External PTY handoff from bash tool
 * - Output notifications to parent agent
 */

import { spawnPty, PtySession, generatePtyId } from "../tools/pty.js";
import { EventEmitter } from "events";
import { activeSessionRef } from "./hooks.js";

export type MonitorStatus = "running" | "completed" | "killed" | "error" | "detached";

export interface MonitorEntry {
  id: string;
  sessionId: string;
  description: string;
  command: string;
  status: MonitorStatus;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  outputLines: string[];
  lastOutput?: string;
  error?: string;
  hasPendingInput?: boolean; // 如果有等待输入的命令
}

type MonitorListener = (entries: MonitorEntry[]) => void;

// 检测是否需要交互式输入的关键词
const INTERACTIVE_PATTERNS = [
  /password\s*[:：]/i,
  /passphrase\s*[:：]/i,
  /enter\s*(your)?\s*password/i,
  /\[sudo\]\s*password/i,
  /press\s*(any)?\s*key\s*to/i,
  /press\s*enter\s*to/i,
  /continue\s*\?\s*\[y\/n\]/i,
  /yes\/no\s*\[\w\]\s*:/i,
  /confirm\s*\?\s*\[y\/n\]/i,
];

function detectInteractivePrompt(output: string): boolean {
  for (const pattern of INTERACTIVE_PATTERNS) {
    if (pattern.test(output)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a monitor notification XML tag for internal LLM communication.
 */
function createMonitorNotification(
  monitorId: string,
  type: "output" | "completed" | "error" | "interactive",
  payload: string
): string {
  const escaped = payload
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  
  return `<monitor-notification>\n  <monitor-id>${monitorId}</monitor-id>\n  <type>${type}</type>\n  <payload>${escaped}</payload>\n</monitor-notification>`;
}

/**
 * Generate a unique monitor ID.
 */
function generateMonitorId(): string {
  return `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class MonitorRegistryImpl extends EventEmitter {
  private monitors = new Map<string, MonitorEntry>();
  private sessions = new Map<string, PtySession>();

  /**
   * Launch a new background monitor with PTY.
   * Returns the monitor ID.
   */
  launch(sessionId: string, command: string, description: string = ""): string {
    const id = generateMonitorId();

    const entry: MonitorEntry = {
      id,
      sessionId,
      description: description || `Monitor: ${command.slice(0, 40)}${command.length > 40 ? "…" : ""}`,
      command,
      status: "running",
      startTime: Date.now(),
      outputLines: [],
    };

    this.monitors.set(id, entry);

    // Create PTY and session
    const pty = spawnPty({
      command: "bash",
      args: ["-c", command],
    });

    const session = new PtySession(id, pty, command);
    
    // Forward data to registry handlers
    session.on("data", (data: string) => {
      this.handlePtyData(id, { type: "data", data });
    });
    
    session.on("exit", ({ exitCode }) => {
      this.handlePtyExit(id, exitCode ?? 0);
    });

    this.sessions.set(id, session);
    this.emit("change", this.getAll());

    return id;
  }

  /**
   * Adopt an existing PtySession into the registry.
   * Used by bash tool when timeout occurs.
   */
  adopt(
    oldSession: PtySession,
    sessionId: string,
    command: string,
    description?: string
  ): string {
    const id = oldSession.id;
    
    // Create a new PtySession with the same pty process
    // This sets up new listeners while old session's listeners are cleaned up by caller
    const pty = oldSession.pty;
    const newSession = new PtySession(id, pty, command);

    const entry: MonitorEntry = {
      id,
      sessionId,
      description: description || `Monitor: ${command.slice(0, 40)}${command.length > 40 ? "…" : ""}`,
      command,
      status: "running",
      startTime: oldSession.startTime,
      outputLines: [],
    };

    this.monitors.set(id, entry);
    this.sessions.set(id, newSession);

    // Forward data to registry handlers
    newSession.on("data", (data: string) => {
      this.handlePtyData(id, { type: "data", data });
    });

    newSession.on("exit", ({ exitCode }) => {
      this.handlePtyExit(id, exitCode ?? 0);
    });

    this.emit("change", this.getAll());
    return id;
  }

  /**
   * Handle PTY data.
   */
  private handlePtyData(id: string, data: PtyData): void {
    const monitor = this.monitors.get(id);
    if (!monitor) return;

    if (data.type === "data" && data.data) {
      // 累积输出
      monitor.outputLines.push(data.data);
      monitor.lastOutput = data.data;

      // 检测交互式提示
      if (detectInteractivePrompt(data.data)) {
        monitor.hasPendingInput = true;
        const notification = createMonitorNotification(
          id,
          "interactive",
          data.data
        );
        this.notifyParent(notification);
      } else {
        const notification = createMonitorNotification(id, "output", data.data);
        this.notifyParent(notification);
      }
    }

    this.emit("change", this.getAll());
  }

  /**
   * Handle PTY exit.
   */
  private handlePtyExit(id: string, exitCode: number): void {
    this.sessions.delete(id);

    const monitor = this.monitors.get(id);
    if (!monitor) return;

    monitor.status = exitCode === 0 ? "completed" : "error";
    monitor.exitCode = exitCode;
    monitor.endTime = Date.now();

    const notification = createMonitorNotification(
      id,
      "completed",
      `Exited with code ${exitCode}`
    );
    this.notifyParent(notification);

    this.emit("change", this.getAll());
  }

  /**
   * Write input to a monitor's PTY.
   */
  write(id: string, input: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    const monitor = this.monitors.get(id);
    if (monitor) {
      monitor.hasPendingInput = false;
    }

    session.write(input);
    return true;
  }

  /**
   * Send a line of input to a monitor's PTY.
   */
  sendLine(id: string, line: string): boolean {
    return this.write(id, line + "\n");
  }

  /**
   * Send Ctrl+C to interrupt a monitor.
   */
  interrupt(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.sendInterrupt();
    return true;
  }

  /**
   * Cancel a running monitor.
   */
  kill(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.kill("SIGTERM");
    this.sessions.delete(id);

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
   * Get a PtySession by monitor ID.
   */
  getSession(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all monitor entries.
   */
  getAll(): MonitorEntry[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get monitor entries for a specific session.
   */
  getBySession(sessionId: string): MonitorEntry[] {
    return this.getAll().filter((m) => m.sessionId === sessionId);
  }

  /**
   * Get only running monitors.
   */
  getRunning(): MonitorEntry[] {
    return this.getAll().filter((m) => m.status === "running");
  }

  /**
   * Get only running monitors for a specific session.
   */
  getRunningBySession(sessionId: string): MonitorEntry[] {
    return this.getBySession(sessionId).filter((m) => m.status === "running");
  }

  /**
   * Subscribe to monitor registry changes.
   */
  subscribe(listener: MonitorListener): () => void {
    this.on("change", listener);
    return () => this.off("change", listener);
  }

  /**
   * Remove a monitor from the registry without killing the process.
   */
  remove(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.detach();
      this.sessions.delete(id);
    }
    const existed = this.monitors.has(id);
    this.monitors.delete(id);
    if (existed) this.emit("change", this.getAll());
    return existed;
  }

  /**
   * Clear all monitors.
   */
  clear(): void {
    for (const session of this.sessions.values()) {
      session.kill("SIGTERM");
    }
    this.sessions.clear();
    this.monitors.clear();
    this.emit("change", this.getAll());
  }

  /**
   * Notify the parent agent session of a monitor event.
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
