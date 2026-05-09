/**
 * Async Subagent Registry
 *
 * Manages background (fire-and-forget) subagents. Each async agent gets a
 * unique ID, runs in the background, and notifies the parent session via
 * followUp() when it completes.
 */

import type { Agent } from "@mariozechner/pi-agent-core";
import { activeSessionRef } from "./hooks.js";
import { runSubagent, type SubagentConfig } from "./subagent.js";

export interface AsyncSubagentEntry {
  id: string;
  description: string;
  status: "running" | "completed" | "failed" | "killed";
  result?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

class SubagentRegistry {
  private entries = new Map<string, AsyncSubagentEntry>();
  private runningAgents = new Map<string, Agent>();
  private listeners: (() => void)[] = [];

  private emit() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
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
   * Launch a subagent in the background and return its ID immediately.
   */
  async launch(config: SubagentConfig): Promise<string> {
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const entry: AsyncSubagentEntry = {
      id,
      description: config.description,
      status: "running",
      startTime: Date.now(),
    };
    this.entries.set(id, entry);

    // Fire-and-forget — do not await
    void this.runInBackground(id, config);
    this.emit();

    return id;
  }

  private async runInBackground(
    id: string,
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
      this.emit();
      this.notifyParent(id, "completed", result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // If the agent was explicitly killed, override status
      if (entry.status === "killed") {
        entry.error = message;
        entry.endTime = Date.now();
        this.emit();
        this.notifyParent(id, "killed", message);
      } else {
        entry.status = "failed";
        entry.error = message;
        entry.endTime = Date.now();
        this.emit();
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

    // Queue as follow-up so the parent sees it on its next turn
    parent.followUp(notification).catch(() => {
      // Silently ignore if the parent session is no longer available
    });
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
