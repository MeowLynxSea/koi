/**
 * Session Task Manager
 *
 * Replaces the global in-memory task Map with per-session isolated storage.
 * Each session's tasks are persisted to ~/.config/koi/sessions/<id>/tasks.json.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

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
  /** Fork source task ID (null for original tasks) */
  forkedFrom: string | null;
  /** Timestamp when this task was forked */
  forkedAt: number | null;
}

/**
 * File System Helpers
 *
 * All fs operations are wrapped with silent error handling so a corrupted tasks.json
 * or missing directory never crashes the agent loop.
 */

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getTasksPath(sessionId: string): string {
  return path.join(KOI_SESSIONS_DIR, sessionId, "tasks.json");
}

function safeReadTasks(filePath: string): Task[] | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Task[];
  } catch {
    return null;
  }
}

function safeWriteTasks(filePath: string, tasks: Task[]): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // Silently ignore write errors
  }
}

function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/**
 * Task Update Helpers
 *
 * updateStringArray applies add/remove delta operations on id arrays (blockedBy, blocks)
 * without mutating the original reference until the final assignment.
 */

function updateStringArray(current: string[], add?: string[], remove?: string[]): string[] {
  let result = [...current];
  if (add) {
    for (const id of add) {
      if (!result.includes(id)) result.push(id);
    }
  }
  if (remove) {
    result = result.filter((id) => !remove.includes(id));
  }
  return result;
}

function applyTaskUpdates(
  task: Task,
  updates: Partial<Pick<Task, "content" | "status" | "priority">> & {
    addBlockedBy?: string[];
    removeBlockedBy?: string[];
    addBlocks?: string[];
    removeBlocks?: string[];
  }
): void {
  if (updates.content !== undefined) task.content = updates.content;
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.priority !== undefined) task.priority = updates.priority;

  task.blockedBy = updateStringArray(task.blockedBy, updates.addBlockedBy, updates.removeBlockedBy);
  task.blocks = updateStringArray(task.blocks, updates.addBlocks, updates.removeBlocks);
}

/**
 * SessionTaskManager
 *
 * Per-session in-memory task storage with JSON persistence.
 * When no session is active, tasks land in a transient "__transient__" store
 * so the API surface never returns undefined/null unexpectedly.
 */

export class SessionTaskManager {
  private stores = new Map<string, Map<string, Task>>();
  private activeSessionId: string | null = null;

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
    return `task-${randomUUID()}`;
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
      forkedFrom: null,
      forkedAt: null,
    };
    this.getStore().set(id, task);
    this.saveActive();
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
    updates: Parameters<typeof applyTaskUpdates>[1]
  ): Task | null {
    const task = this.getStore().get(taskId);
    if (!task) return null;

    applyTaskUpdates(task, updates);
    task.updatedAt = Date.now();
    this.saveActive();
    return task;
  }

  deleteTask(taskId: string): boolean {
    const ok = this.getStore().delete(taskId);
    if (ok) this.saveActive();
    return ok;
  }

  load(sessionId: string): void {
    const tasksArray = safeReadTasks(getTasksPath(sessionId));
    if (!tasksArray) {
      this.stores.set(sessionId, new Map());
      return;
    }
    const map = new Map<string, Task>();
    for (const t of tasksArray) {
      map.set(t.id, t);
    }
    this.stores.set(sessionId, map);
  }

  save(sessionId: string): void {
    const store = this.stores.get(sessionId);
    if (!store) return;
    safeWriteTasks(getTasksPath(sessionId), Array.from(store.values()));
  }

  saveActive(): void {
    if (this.activeSessionId) {
      this.save(this.activeSessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.stores.delete(sessionId);
    safeDeleteFile(getTasksPath(sessionId));
  }

  /**
   * Fork all tasks for a new session.
   * Creates new task IDs and sets fork metadata to track the fork relationship.
   * Returns a map of old task IDs to new task IDs for updating blockedBy/blocks references.
   */
  forkTasks(): Map<string, string> {
    const currentStore = this.getStore();
    const oldToNewIdMap = new Map<string, string>();
    const now = Date.now();

    // Collect existing tasks before mutating the store
    const existingTasks = Array.from(currentStore.values());

    // First pass: create new IDs
    for (const task of existingTasks) {
      oldToNewIdMap.set(task.id, this.generateTaskId());
    }

    // Clear the store so only forked tasks remain
    currentStore.clear();

    // Second pass: create forked tasks with updated references
    for (const task of existingTasks) {
      const newId = oldToNewIdMap.get(task.id)!;
      const forkedTask: Task = {
        ...task,
        id: newId,
        forkedFrom: task.id,
        forkedAt: now,
        // Update blockedBy references to new IDs
        blockedBy: task.blockedBy.map(id => oldToNewIdMap.get(id) ?? id),
        // Update blocks references to new IDs
        blocks: task.blocks.map(id => oldToNewIdMap.get(id) ?? id),
      };
      currentStore.set(newId, forkedTask);
    }

    this.saveActive();
    return oldToNewIdMap;
  }
}

// Global singleton instance
export const globalTaskManager = new SessionTaskManager();
