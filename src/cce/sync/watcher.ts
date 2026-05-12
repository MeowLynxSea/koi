/**
 * File watcher — monitors the project directory for file system changes.
 *
 * Uses fs.watch recursively where possible, falling back to polling or
 * chokidar if needed. Events are debounced and fed into a queue.
 */

import fs from "fs";
import path from "path";

export interface WatcherEvent {
  type: "created" | "modified" | "deleted" | "moved";
  namespace: string;
  path: string;
  dest_path?: string;
}

const BINARY_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".obj",
  ".a", ".lib", ".pdb", ".ilk", ".class", ".jar", ".war",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".svg",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".db", ".sqlite", ".sqlite3", ".lock", ".pid", ".sock",
  ".pyc", ".pyo", ".egg", ".whl",
]);

const IGNORED_DIR_PARTS = new Set([
  ".git", "__pycache__", ".venv", "venv", "node_modules",
  "dist", "build", ".cce", ".idea", ".vscode", ".pytest_cache",
  ".mypy_cache", ".tox", ".eggs", ".coverage", "htmlcov",
  "target", ".gradle", "bin", "obj",
]);

function shouldIgnore(absPath: string, projectPath: string): boolean {
  let rel: string;
  try {
    rel = path.relative(projectPath, absPath);
  } catch {
    return true;
  }
  const parts = rel.split(path.sep);
  if (parts.some((p) => IGNORED_DIR_PARTS.has(p))) return true;
  const ext = path.extname(absPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const st = fs.statSync(absPath);
    if (st.isDirectory()) return true;
    if (st.size > 2 * 1024 * 1024) return true;
  } catch {
    return true;
  }
  return false;
}

export class FileWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private projectPath = "";
  private namespace = "";
  private excludePatterns: string[] = [];
  private eventQueue: WatcherEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private consumer: ((events: WatcherEvent[]) => void) | null = null;
  private running = false;

  registerProject(namespace: string, projectPath: string, excludePatterns?: string[]): void {
    this.namespace = namespace;
    this.projectPath = path.resolve(projectPath);
    this.excludePatterns = excludePatterns ?? [];
  }

  start(onEvents: (events: WatcherEvent[]) => void): void {
    if (this.running) return;
    this.consumer = onEvents;
    this.running = true;

    try {
      const watcher = fs.watch(this.projectPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const absPath = path.join(this.projectPath, filename);
        if (shouldIgnore(absPath, this.projectPath)) return;
        if (this.excludePatterns.some((p) => filename.includes(p))) return;

        const event: WatcherEvent = {
          type: eventType === "rename" ? "deleted" : "modified",
          namespace: this.namespace,
          path: absPath,
        };
        this._enqueue(event);
      });
      this.watchers.set(this.namespace, watcher);
    } catch {
      // fs.watch recursive may not be supported on all platforms
      this._fallbackWatch(this.projectPath);
    }
  }

  private _fallbackWatch(dir: string): void {
    try {
      const watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename) return;
        const absPath = path.join(dir, filename);
        if (shouldIgnore(absPath, this.projectPath)) return;

        const event: WatcherEvent = {
          type: eventType === "rename" ? "deleted" : "modified",
          namespace: this.namespace,
          path: absPath,
        };
        this._enqueue(event);
      });
      this.watchers.set(`${this.namespace}:${dir}`, watcher);

      // Watch subdirectories
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !IGNORED_DIR_PARTS.has(entry.name)) {
          this._fallbackWatch(path.join(dir, entry.name));
        }
      }
    } catch {
      // ignore
    }
  }

  private _enqueue(event: WatcherEvent): void {
    // Deduplicate: keep only the latest event per path
    const idx = this.eventQueue.findIndex((e) => e.path === event.path);
    if (idx >= 0) this.eventQueue.splice(idx, 1);
    this.eventQueue.push(event);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = this.eventQueue.splice(0);
      if (this.consumer && batch.length > 0) {
        this.consumer(batch);
      }
    }, 5000);
  }

  stop(): void {
    this.running = false;
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
