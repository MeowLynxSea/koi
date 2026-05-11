/**
 * Async Subagent Registry
 *
 * Manages background (fire-and-forget) subagents. Each async agent gets a
 * unique ID, runs in the background, and notifies the parent session via
 * followUp() when it completes.
 * Subagents are persisted per-session and restored when loading a session.
 */

import type { Agent } from "@mariozechner/pi-agent-core";
import { activeSessionRef } from "./hooks.js";
import { runSubagent, type SubagentConfig } from "./subagent.js";
import {
  updateSubagentState,
  loadSubagentState,
  type SubagentEntryState,
} from "./session-store.js";

export interface AsyncSubagentEntry {
  id: string;
  sessionId: string;
  description: string;
  status: "running" | "completed" | "failed" | "killed";
  result?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Convert AsyncSubagentEntry to SubagentEntryState for persistence.
 */
function toPersisted(entry: AsyncSubagentEntry): SubagentEntryState {
  return {
    id: entry.id,
    description: entry.description,
    status: entry.status,
    result: entry.result,
    error: entry.error,
    startTime: entry.startTime,
    endTime: entry.endTime,
  };
}

class SubagentRegistry {
  private entries = new Map<string, AsyncSubagentEntry>();
  private runningAgents = new Map<string, Agent>();
  private listeners: (() => void)[] = [];
  private saveDebounceTimers = new Map<string, NodeJS.Timeout>();

  private emit(sessionId?: string) {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
    // Persist subagent state with debounce to avoid excessive writes
    if (sessionId) {
      this.debouncedSave(sessionId);
    }
  }

  private debouncedSave(sessionId: string): void {
    // Clear existing timer if any
    const existing = this.saveDebounceTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }
    // Debounce save by 500ms
    const timer = setTimeout(() => {
      this.saveDebounceTimers.delete(sessionId);
      const sessionEntries = this.getBySession(sessionId);
      const persisted = sessionEntries.map(toPersisted);
      updateSubagentState(sessionId, persisted);
    }, 500);
    this.saveDebounceTimers.set(sessionId, timer);
  }

  /**
   * Restore subagent state for a session from persistent storage.
   * Running subagents are kept as-is (they'll complete in the background).
   * Completed/failed subagents are restored with their final status.
   */
  restoreFromSession(sessionId: string): void {
    const persisted = loadSubagentState(sessionId);
    for (const entry of persisted) {
      // Skip if already exists (running)
      if (this.entries.has(entry.id)) continue;
      // Restore completed/failed entries
      if (entry.status !== "running") {
        this.entries.set(entry.id, {
          ...entry,
          sessionId,
        });
      }
      // Don't restore running entries - they won't be running after restart
      // We could mark them as "disconnected" but it's cleaner to just omit them
    }
    this.emit();
  }

  /**
   * Clear all subagents for a session (called when switching sessions).
   * Running subagents are kept in memory but won't be displayed.
   */
  clearSession(_sessionId: string): void {
    // Just emit to trigger UI refresh without removing entries
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  get(id: string): AsyncSubagentEntry | undefined {
    return this.entries.get(id);
  }

  getAll(): AsyncSubagentEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => b.startTime - a.startTime
    );
  }

  /**
   * Get subagent entries for a specific session.
   */
  getBySession(sessionId: string): AsyncSubagentEntry[] {
    return this.getAll().filter((e) => e.sessionId === sessionId);
  }

  /**
   * Launch a subagent in the background and return its ID immediately.
   */
  async launch(sessionId: string, config: SubagentConfig): Promise<string> {
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const entry: AsyncSubagentEntry = {
      id,
      sessionId,
      description: config.description,
      status: "running",
      startTime: Date.now(),
    };
    this.entries.set(id, entry);

    // Fire-and-forget — do not await
    void this.runInBackground(id, sessionId, config);
    this.emit(sessionId);

    return id;
  }

  private async runInBackground(
    id: string,
    sessionId: string,
    config: SubagentConfig
  ): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;

    let agentRef: Agent | undefined;

    try {
      const result = await runSubagent(config, (agent) => {
        agentRef = agent;
        this.runningAgents.set(id, agent);
      });
      entry.status = "completed";
      entry.result = result;
      entry.endTime = Date.now();
      this.emit(sessionId);
      this.notifyParent(id, "completed", result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If the agent was explicitly killed, override status
      if (entry.status === "killed") {
        entry.error = message;
        entry.endTime = Date.now();
        this.emit(sessionId);
        this.notifyParent(id, "killed", message);
      } else {
        entry.status = "failed";
        entry.error = message;
        entry.endTime = Date.now();
        this.emit(sessionId);
        this.notifyParent(id, "failed", message);
      }
    } finally {
      if (agentRef) {
        this.runningAgents.delete(id);
      }
    }
  }

  private notifyParent(
    agentId: string,
    status: string,
    summary: string
  ): void {
    const parent = activeSessionRef.current;
    if (!parent) return;

    const truncated =
      summary.length > 500 ? summary.slice(0, 500) + "..." : summary;
    const notification = [
      `<task-notification>`,
      `  <task-id>${agentId}</task-id>`,
      `  <status>${status}</status>`,
      `  <summary>${truncated}</summary>`,
      `</task-notification>`,
    ].join("\n");

    // If the parent is still running, inject as steer so it gets processed
    // at the end of the current turn. If idle, prompt immediately to trigger
    // a new run right away.
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

  /**
   * Abort a running async subagent by ID.
   * Returns true if the agent was found and aborted.
   */
  kill(id: string): boolean {
    const agent = this.runningAgents.get(id);
    if (!agent) {
      // Agent may have finished already; mark as killed if still running in
      // our record.
      const entry = this.entries.get(id);
      if (entry && entry.status === "running") {
        entry.status = "killed";
        entry.endTime = Date.now();
        return true;
      }
      return false;
    }
    const entry = this.entries.get(id);
    if (entry) {
      entry.status = "killed";
    }
    agent.abort();
    return true;
  }
}

/** Global singleton registry for async subagents. */
export const subagentRegistry = new SubagentRegistry();
