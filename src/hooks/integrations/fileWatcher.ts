/**
 * File Watcher Integration
 *
 * Recursively watches directories for file changes.
 * Uses a simple polling-based watcher to avoid native dependency issues.
 * Detects added, removed, and modified files.
 */

import fs from "fs";
import path from "path";
import { emitFileChanged } from "./fileHooks.js";

interface WatchedFile {
  path: string;
  mtime: number;
  size: number;
}

interface WatchedDir {
  rootPath: string;
  snapshot: Map<string, WatchedFile>;
}

const watchedDirs = new Map<string, WatchedDir>();
let watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Recursively scan a directory and return all files with their stats.
 */
function scanDir(dir: string): Map<string, WatchedFile> {
  const result = new Map<string, WatchedFile>();
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs and common non-project dirs
      if (entry.name.startsWith(".") && entry.name !== ".claude" && entry.name !== ".koi") continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      const sub = scanDir(fullPath);
      for (const [k, v] of sub) result.set(k, v);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        result.set(fullPath, {
          path: fullPath,
          mtime: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        // ignore
      }
    }
  }
  return result;
}

/**
 * Compare two snapshots and return changed file paths.
 */
function detectChanges(
  oldSnap: Map<string, WatchedFile>,
  newSnap: Map<string, WatchedFile>
): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [p, newInfo] of newSnap) {
    const oldInfo = oldSnap.get(p);
    if (!oldInfo) {
      added.push(p);
    } else if (oldInfo.mtime !== newInfo.mtime || oldInfo.size !== newInfo.size) {
      changed.push(p);
    }
  }

  for (const p of oldSnap.keys()) {
    if (!newSnap.has(p)) {
      removed.push(p);
    }
  }

  return { changed, added, removed };
}

/**
 * Start watching a set of directories for changes.
 * Each directory is scanned recursively on every poll.
 */
export function startFileWatcher(dirs: string[], sessionId?: string): void {
  for (const d of dirs) {
    const resolved = path.resolve(d);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      const snapshot = scanDir(resolved);
      watchedDirs.set(resolved, {
        rootPath: resolved,
        snapshot,
      });
    }
  }

  if (watchInterval) return;

  watchInterval = setInterval(() => {
    for (const [dirPath, dirInfo] of watchedDirs) {
      if (!fs.existsSync(dirPath)) continue;
      const newSnapshot = scanDir(dirPath);
      const { changed, added, removed } = detectChanges(dirInfo.snapshot, newSnapshot);

      // Update snapshot before emitting to avoid re-processing same changes
      dirInfo.snapshot = newSnapshot;

      for (const p of changed) {
        void emitFileChanged(p, sessionId);
      }
      for (const p of added) {
        void emitFileChanged(p, sessionId);
      }
      for (const p of removed) {
        void emitFileChanged(p, sessionId);
      }
    }
  }, 2000);
}

/**
 * Stop the file watcher.
 */
export function stopFileWatcher(): void {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
  watchedDirs.clear();
}

/**
 * Add additional directories to watch.
 */
export function addWatchedDirs(dirs: string[]): void {
  for (const d of dirs) {
    const resolved = path.resolve(d);
    if (!watchedDirs.has(resolved) && fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      watchedDirs.set(resolved, {
        rootPath: resolved,
        snapshot: scanDir(resolved),
      });
    }
  }
}
