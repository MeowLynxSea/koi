/**
 * Session Snapshots
 *
 * Records per-entry snapshots of Koi state (tasks, plan, agent mode) using
 * Pi's CustomEntry mechanism. Each snapshot is stored as a `custom` entry
 * with `customType: "koi:snapshot"` in the session tree.
 *
 * Because `appendCustomEntry` appends the snapshot as a child of the current
 * leaf and then advances leaf, the snapshot sits **after** the turn it
 * represents. When forking to entry X we must therefore look **forward**
 * from X (in X's subtree) to find the snapshot that captured the state
 * right after X's turn completed. When loading a session we look
 * **backward** from the current leaf toward root.
 */

import type { AgentSession, SessionEntry } from "@mariozechner/pi-coding-agent";
import type { Task } from "./session-tasks.js";
import type { SessionTaskManager } from "./session-tasks.js";
import type { AgentMode } from "./mode.js";
import { setCurrentPlanText } from "./plan-ui.js";
import fs from "fs";

export interface KoiSnapshotData {
  tasks: Task[];
  planText: string | null;
  agentMode: AgentMode;
  activeTools: string[];
}

const SNAPSHOT_CUSTOM_TYPE = "koi:snapshot";

/**
 * Save a snapshot of the current Koi state as a CustomEntry in the Pi session.
 * The snapshot is attached as a child of the current leaf entry, then leaf advances.
 */
export function saveSnapshot(
  session: AgentSession,
  data: KoiSnapshotData
): string {
  // Deep clone to prevent later mutations from corrupting persisted snapshot data.
  // Pi's appendCustomEntry does not clone the payload, so object references
  // (e.g. Task objects in the tasks array) would be mutated by subsequent
  // task updates, making old snapshots reflect the latest state instead of
  // the state at the time they were saved.
  const cloned: KoiSnapshotData = {
    tasks: data.tasks.map((t) => ({ ...t })),
    planText: data.planText,
    agentMode: data.agentMode,
    activeTools: [...data.activeTools],
  };
  return session.sessionManager.appendCustomEntry(SNAPSHOT_CUSTOM_TYPE, cloned);
}

/**
 * Save a snapshot only if the state has changed since the last snapshot.
 * Returns the new entry id, or null if nothing changed.
 */
export function saveSnapshotIfChanged(
  session: AgentSession,
  data: KoiSnapshotData
): string | null {
  const leafId = session.sessionManager.getLeafId();
  if (!leafId) return null;

  const last = findSnapshotBeforeEntry(session, leafId);
  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] saveSnapshotIfChanged leafId=${leafId} last=${last ? last.entryId : "null"} tasks=${data.tasks.length}\n`);
  if (last?.data) {
    const s = last.data;
    const sameTasks =
      s.tasks.length === data.tasks.length &&
      s.tasks.every(
        (t, i) =>
          t.id === data.tasks[i]!.id &&
          t.content === data.tasks[i]!.content &&
          t.status === data.tasks[i]!.status &&
          t.priority === data.tasks[i]!.priority
      );
    const samePlan = s.planText === data.planText;
    const sameMode = s.agentMode === data.agentMode;
    const sameTools =
      s.activeTools.length === data.activeTools.length &&
      s.activeTools.every((t, i) => t === data.activeTools[i]);

    fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] saveSnapshotIfChanged compare sameTasks=${sameTasks} samePlan=${samePlan} sameMode=${sameMode} sameTools=${sameTools}\n`);
    if (sameTasks && samePlan && sameMode && sameTools) {
      fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] saveSnapshotIfChanged -> skip saving (no change)\n`);
      return null;
    }
  }

  const id = saveSnapshot(session, data);
  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] saveSnapshotIfChanged -> saved new snapshot id=${id}\n`);
  return id;
}

/**
 * Walk the branch path from root to `targetEntryId` backwards and return the
 * nearest custom entry with type `koi:snapshot`.
 * Used when loading a session (leaf is known).
 */
export function findSnapshotBeforeEntry(
  session: AgentSession,
  targetEntryId: string
): { entryId: string; data: KoiSnapshotData } | null {
  const branch = session.sessionManager.getBranch(targetEntryId);
  const snapshotIds: string[] = [];
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i]!;
    if (
      entry.type === "custom" &&
      (entry as unknown as { customType?: string }).customType ===
        SNAPSHOT_CUSTOM_TYPE
    ) {
      snapshotIds.push(entry.id);
      fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] findSnapshotBeforeEntry target=${targetEntryId} found=${entry.id} tasks=${(entry as unknown as { data?: KoiSnapshotData }).data?.tasks?.length ?? 0} taskStatus=${(entry as unknown as { data?: KoiSnapshotData }).data?.tasks?.map(t => t.status).join(",") ?? "none"}\n`);
      return {
        entryId: entry.id,
        data: (entry as unknown as { data?: KoiSnapshotData }).data as
          | KoiSnapshotData
          | undefined,
      };
    }
  }
  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] findSnapshotBeforeEntry target=${targetEntryId} no snapshot found on branch of ${branch.length} entries\n`);
  return null;
}

/**
 * Search forward from `targetEntryId` through its entire subtree (using all
 * entries in the session file) to find the nearest snapshot.
 * Used when forking: the snapshot lives after the selected entry, not on the
 * branch path *to* the entry.
 */
export function findSnapshotAfterEntry(
  session: AgentSession,
  targetEntryId: string
): { entryId: string; data: KoiSnapshotData } | null {
  const allEntries = session.sessionManager.getEntries();
  const byId = new Map<string, SessionEntry>();
  const children = new Map<string, string[]>();

  for (const entry of allEntries) {
    byId.set(entry.id, entry);
    const parentId = entry.parentId ?? "root";
    const list = children.get(parentId) ?? [];
    list.push(entry.id);
    children.set(parentId, list);
  }

  const queue = [targetEntryId];
  const visited = new Set<string>();
  const visitedSnapshots: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const entry = byId.get(id);
    if (
      entry &&
      entry.type === "custom" &&
      (entry as unknown as { customType?: string }).customType ===
        SNAPSHOT_CUSTOM_TYPE
    ) {
      visitedSnapshots.push(entry.id);
      fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] findSnapshotAfterEntry target=${targetEntryId} found=${entry.id} tasks=${(entry as unknown as { data?: KoiSnapshotData }).data?.tasks?.length ?? 0} taskStatus=${(entry as unknown as { data?: KoiSnapshotData }).data?.tasks?.map(t => t.status).join(",") ?? "none"} visitedSnapshots=[${visitedSnapshots.join(",")}]\n`);
      return {
        entryId: entry.id,
        data: (entry as unknown as { data?: KoiSnapshotData }).data as
          | KoiSnapshotData
          | undefined,
      };
    }

    const childIds = children.get(id) ?? [];
    queue.push(...childIds);
  }

  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] findSnapshotAfterEntry target=${targetEntryId} no snapshot found in subtree visited=${visited.size} entries\n`);
  return null;
}

/**
 * Restore tasks and plan text from the nearest snapshot related to
 * `targetEntryId`.
 *
 * Strategy:
 * 1. Try to find a snapshot **after** the entry (forward in the subtree).
 *    This is the normal case when forking: the snapshot was appended as a
 *    child of the turn that ended at/after the selected entry.
 * 2. If no forward snapshot exists, fall back to a snapshot **before/at**
 *    the entry (walking backward toward root). This handles the load-session
 *    case where the leaf itself may be a snapshot or the snapshot sits on the
 *    branch path before the leaf.
 *
 * Returns the snapshot data (including agentMode/activeTools) so the caller
 * can restore mode state, or null if no snapshot was found.
 */
export function restoreSnapshot(
  session: AgentSession,
  targetEntryId: string,
  taskManager: SessionTaskManager
): KoiSnapshotData | null {
  let snapshot = findSnapshotAfterEntry(session, targetEntryId);
  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] restoreSnapshot entryId=${targetEntryId} forward=${snapshot ? snapshot.entryId : "null"}\n`);
  if (!snapshot?.data) {
    snapshot = findSnapshotBeforeEntry(session, targetEntryId);
    fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] restoreSnapshot fallback=${snapshot ? snapshot.entryId : "null"}\n`);
  }
  if (!snapshot?.data) return null;

  const taskStatuses = snapshot.data.tasks.map(t => `${t.id}:${t.status}`).join(", ");
  fs.appendFileSync("/tmp/koi-snapshot-debug.log", `[snapshot] restoreSnapshot -> restoring tasks=[${taskStatuses}] plan=${snapshot.data.planText?.slice(0, 20) ?? "null"} mode=${snapshot.data.agentMode}\n`);

  taskManager.setTasks(snapshot.data.tasks);
  setCurrentPlanText(snapshot.data.planText ?? "");

  return snapshot.data;
}
