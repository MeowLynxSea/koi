/**
 * File Watcher Integration
 *
 * Watches files for changes and emits FileChanged hooks.
 * Uses a simple polling-based watcher to avoid native dependency issues.
 */

import fs from "fs";
import path from "path";
import { emitFileChanged } from "./fileHooks.js";

interface WatchedPath {
  path: string;
  mtime: number;
  size: number;
}

const watchedPaths = new Map<string, WatchedPath>();
let watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start watching a set of paths for changes.
 */
export function startFileWatcher(paths: string[], sessionId?: string): void {
  for (const p of paths) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      watchedPaths.set(resolved, {
        path: resolved,
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  if (watchInterval) return;

  watchInterval = setInterval(() => {
    for (const [watchPath, info] of watchedPaths) {
      try {
        const stat = fs.statSync(watchPath);
        if (stat.mtimeMs !== info.mtime || stat.size !== info.size) {
          info.mtime = stat.mtimeMs;
          info.size = stat.size;
          void emitFileChanged(watchPath, sessionId);
        }
      } catch {
        // File may have been deleted; ignore
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
  watchedPaths.clear();
}

/**
 * Add additional paths to watch.
 */
export function addWatchedPaths(paths: string[]): void {
  for (const p of paths) {
    const resolved = path.resolve(p);
    if (!watchedPaths.has(resolved) && fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      watchedPaths.set(resolved, {
        path: resolved,
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    }
  }
}
