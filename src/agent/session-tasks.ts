/**
 * Session Task Manager
 *
 * Replaces the global in-memory task Map with per-session isolated storage.
 * Each session's tasks are persisted to ~/.config/koi/sessions/<id>/tasks.json.
 */

import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const KOI_SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");

type TaskStatus = "pending" | "in_progress" | "completed";
type TaskPriority = "high" | "medium" | "low";

export interface Task {
  id: string;
  content: string;
  status: TaskStatus;
  priority: TaskPriority;
  blockedBy: string[];
  blocks: string[];
  createdAt: number;
  updatedAt: number;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getTasksPath(sessionId: string): string {
  return path.join(KOI_SESSIONS_DIR, sessionId, "tasks.json");
}

export class SessionTaskManager {
  private stores = new Map<string, Map<string, Task>>();
  private activeSessionId: string | null = null;
  private taskIdCounter = 0;

  setActiveSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    if (!this.stores.has(sessionId)) {
      this.load(sessionId);
    }
  }

  getCurrentSessionId(): string | null {
    return this.activeSessionId;
  }

  private getStore(): Map<string, Task> {
    if (!this.activeSessionId) {
      // Fallback to a transient in-memory store if no session is active
      const transientId = "__transient__";
      if (!this.stores.has(transientId)) {
        this.stores.set(transientId, new Map());
      }
      return this.stores.get(transientId)!;
    }
    if (!this.stores.has(this.activeSessionId)) {
      this.stores.set(this.activeSessionId, new Map());
    }
    return this.stores.get(this.activeSessionId)!;
  }

  generateTaskId(): string {
    return `task-${++this.taskIdCounter}`;
  }

  createTask(
    content: string,
    priority: TaskPriority = "medium",
    blockedBy: string[] = [],
    blocks: string[] = []
  ): Task {
    const id = this.generateTaskId();
    const now = Date.now();
    const task: Task = {
      id,
      content,
      status: "pending",
      priority,
      blockedBy: [...blockedBy],
      blocks: [...blocks],
      createdAt: now,
      updatedAt: now,
    };
    this.getStore().set(id, task);
    if (this.activeSessionId) this.save(this.activeSessionId);
    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.getStore().get(taskId);
  }

  listTasks(status?: TaskStatus): Task[] {
    let all = Array.from(this.getStore().values());
    if (status) {
      all = all.filter((t) => t.status === status);
    }
    const statusOrder = { in_progress: 0, pending: 1, completed: 2 };
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    all.sort((a, b) => {
      const s = statusOrder[a.status] - statusOrder[b.status];
      if (s !== 0) return s;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    return all;
  }

  updateTask(
    taskId: string,
    updates: Partial<Pick<Task, "content" | "status" | "priority">> & {
      addBlockedBy?: string[];
      removeBlockedBy?: string[];
      addBlocks?: string[];
      removeBlocks?: string[];
    }
  ): Task | null {
    const task = this.getStore().get(taskId);
    if (!task) return null;

    if (updates.content !== undefined) task.content = updates.content;
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.addBlockedBy) {
      for (const id of updates.addBlockedBy) {
        if (!task.blockedBy.includes(id)) task.blockedBy.push(id);
      }
    }
    if (updates.removeBlockedBy) {
      task.blockedBy = task.blockedBy.filter((id) => !updates.removeBlockedBy!.includes(id));
    }
    if (updates.addBlocks) {
      for (const id of updates.addBlocks) {
        if (!task.blocks.includes(id)) task.blocks.push(id);
      }
    }
    if (updates.removeBlocks) {
      task.blocks = task.blocks.filter((id) => !updates.removeBlocks!.includes(id));
    }

    task.updatedAt = Date.now();
    if (this.activeSessionId) this.save(this.activeSessionId);
    return task;
  }

  deleteTask(taskId: string): boolean {
    const ok = this.getStore().delete(taskId);
    if (ok && this.activeSessionId) this.save(this.activeSessionId);
    return ok;
  }

  load(sessionId: string): void {
    try {
      const filePath = getTasksPath(sessionId);
      if (!fs.existsSync(filePath)) {
        this.stores.set(sessionId, new Map());
        return;
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const tasksArray: Task[] = JSON.parse(raw);
      const map = new Map<string, Task>();
      for (const t of tasksArray) {
        map.set(t.id, t);
      }
      this.stores.set(sessionId, map);
    } catch {
      this.stores.set(sessionId, new Map());
    }
  }

  save(sessionId: string): void {
    try {
      const dir = path.join(KOI_SESSIONS_DIR, sessionId);
      ensureDir(dir);
      const store = this.stores.get(sessionId);
      if (!store) return;
      const tasksArray = Array.from(store.values());
      fs.writeFileSync(getTasksPath(sessionId), JSON.stringify(tasksArray, null, 2) + "\n", {
        mode: 0o600,
      });
    } catch {
      // Silently ignore write errors
    }
  }

  saveActive(): void {
    if (this.activeSessionId) {
      this.save(this.activeSessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.stores.delete(sessionId);
    try {
      const filePath = getTasksPath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }
  }
}

// Global singleton instance
export const globalTaskManager = new SessionTaskManager();
