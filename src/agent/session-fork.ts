/**
 * Session Fork Manager
 *
 * Manages fork metadata for session branching. Tracks:
 * - Fork relationships between sessions
 * - Task snapshots at fork time
 * - Agent mode state at fork time
 * - Pending plan content at fork time
 *
 * All fork metadata is persisted to ~/.config/koi/sessions/forks/<sessionId>.json
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { Task } from "./session-tasks.js";
import type { AgentMode } from "./mode.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const KOI_SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const FORK_METADATA_DIR = path.join(KOI_SESSIONS_DIR, "forks");

export interface ForkMetadata {
  /** ID of the forked session */
  forkId: string;
  /** ID of the source session this was forked from */
  sourceSessionId: string;
  /** Branch ID in the source session at the fork point */
  sourceBranchId: string;
  /** Entry ID where the fork occurred */
  forkPoint: string;
  /** Timestamp when the fork was created */
  forkedAt: number;
  /** Snapshot of tasks at fork time (before fork) */
  tasksSnapshot: Task[];
  /** Agent mode state at fork time */
  agentMode: AgentMode;
  /** Active tool names at fork time */
  activeTools: string[];
  /** Pending plan text at fork time (if in plan mode with pending content) */
  pendingPlanText: string | null;
}

export interface ForkTreeNode {
  sessionId: string;
  forkId: string;
  title: string;
  forkedAt: number;
  children: ForkTreeNode[];
}

/**
 * File System Helpers
 */

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getForkMetadataPath(sessionId: string): string {
  return path.join(FORK_METADATA_DIR, `${sessionId}.json`);
}

function safeReadFile<T>(filePath: string, parser: (raw: string) => T): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return parser(raw);
  } catch {
    return null;
  }
}

function safeWriteFile(filePath: string, data: string): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, data, { mode: 0o600 });
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
 * ForkManager
 *
 * Singleton class managing all fork metadata for sessions.
 * Provides methods to create, save, load, and query fork relationships.
 */
export class ForkManager {
  private cache = new Map<string, ForkMetadata | null>();

  /**
   * Save fork metadata for a session.
   * Also updates the parent session's childForks list.
   */
  saveForkMetadata(forkId: string, metadata: ForkMetadata): void {
    this.cache.set(forkId, metadata);
    safeWriteFile(
      getForkMetadataPath(forkId),
      JSON.stringify(metadata, null, 2) + "\n"
    );

    // Update parent session's child forks
    const parentMeta = this.loadForkMetadata(metadata.sourceSessionId);
    if (parentMeta) {
      // Parent is a forked session, update its child forks tracking
      const childForksPath = path.join(
        KOI_SESSIONS_DIR,
        metadata.sourceSessionId,
        "child-forks.json"
      );
      const existingChildForks: string[] = safeReadFile<string[]>(childForksPath, (raw) => JSON.parse(raw) as string[]) ?? [];
      if (!existingChildForks.includes(forkId)) {
        safeWriteFile(childForksPath, JSON.stringify([...existingChildForks, forkId], null, 2) + "\n");
      }
    }
  }

  /**
   * Load fork metadata for a session from disk.
   */
  loadForkMetadata(sessionId: string): ForkMetadata | null {
    // Check cache first
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId) ?? null;
    }

    const metadata = safeReadFile<ForkMetadata>(
      getForkMetadataPath(sessionId),
      (raw) => JSON.parse(raw) as ForkMetadata
    );

    this.cache.set(sessionId, metadata);
    return metadata;
  }

  /**
   * Get the fork metadata for a session, returning null if not a fork.
   */
  getForkMetadata(sessionId: string): ForkMetadata | null {
    return this.loadForkMetadata(sessionId);
  }

  /**
   * Check if a session is a fork.
   */
  isFork(sessionId: string): boolean {
    const meta = this.loadForkMetadata(sessionId);
    return meta !== null;
  }

  /**
   * Get the source session ID for a fork.
   */
  getSourceSessionId(sessionId: string): string | null {
    const meta = this.loadForkMetadata(sessionId);
    return meta?.sourceSessionId ?? null;
  }

  /**
   * Get all child fork IDs for a session.
   */
  getChildForks(sessionId: string): string[] {
    const childForksPath = path.join(KOI_SESSIONS_DIR, sessionId, "child-forks.json");
    return safeReadFile<string[]>(childForksPath, (raw) => JSON.parse(raw) as string[]) ?? [];
  }

  /**
   * Calculate the fork depth of a session (0 for original, 1+ for forks).
   */
  getForkDepth(sessionId: string): number {
    let depth = 0;
    let currentId: string | null = sessionId;

    while (currentId) {
      const meta = this.loadForkMetadata(currentId);
      if (!meta) break;
      depth++;
      currentId = meta.sourceSessionId;
    }

    return depth - 1; // Subtract 1 because original sessions have depth 0
  }

  /**
   * Build the full fork tree starting from a session.
   */
  getForkTree(sessionId: string, title: string = "Session"): ForkTreeNode {
    const meta = this.loadForkMetadata(sessionId);
    const forkedAt = meta?.forkedAt ?? Date.now();
    
    const node: ForkTreeNode = {
      sessionId,
      forkId: meta?.forkId ?? sessionId,
      title,
      forkedAt,
      children: [],
    };

    // Recursively build children
    const childForks = this.getChildForks(sessionId);
    for (const childId of childForks) {
      const childMeta = this.loadForkMetadata(childId);
      const childTitle = childMeta?.forkPoint
        ? `Fork at ${childMeta.forkPoint.slice(0, 8)}...`
        : "Fork";
      node.children.push(this.getForkTree(childId, childTitle));
    }

    return node;
  }

  /**
   * Get all fork metadata for sessions that originated from a given session.
   */
  getForkHistory(sessionId: string): ForkMetadata[] {
    const results: ForkMetadata[] = [];
    const childForks = this.getChildForks(sessionId);

    for (const childId of childForks) {
      const meta = this.loadForkMetadata(childId);
      if (meta) {
        results.push(meta);
        // Recursively get grandchildren
        results.push(...this.getForkHistory(childId));
      }
    }

    return results;
  }

  /**
   * Delete fork metadata for a session.
   * Also removes the session ID from parent session's child-forks list.
   */
  deleteForkMetadata(sessionId: string): void {
    const meta = this.loadForkMetadata(sessionId);
    if (meta) {
      // Remove from parent's child-forks
      const parentChildForksPath = path.join(
        KOI_SESSIONS_DIR,
        meta.sourceSessionId,
        "child-forks.json"
      );
      const existingChildForks: string[] = safeReadFile<string[]>(parentChildForksPath, (raw) => JSON.parse(raw) as string[]) ?? [];
      const updatedChildForks = existingChildForks.filter(id => id !== sessionId);
      if (updatedChildForks.length > 0) {
        safeWriteFile(parentChildForksPath, JSON.stringify(updatedChildForks, null, 2) + "\n");
      } else {
        safeDeleteFile(parentChildForksPath);
      }
    }

    this.cache.delete(sessionId);
    safeDeleteFile(getForkMetadataPath(sessionId));
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Global singleton instance
export const forkManager = new ForkManager();
