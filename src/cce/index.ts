/**
 * Cat's Context Engine — Native TypeScript integration for Koi.
 *
 * Lazy-initialized: CCE is only started when the user explicitly enables it
 * via the CCE modal or settings. This avoids blocking app startup with
 * embedding model downloads.
 */

import { getDbManager } from "./core/db.js";
import { initDb } from "./core/init.js";
import { setWorkingMemoryManager } from "./brain/working-memory.js";
import { GraphService } from "./graph/graph-service.js";
import { SearchIndexer } from "./graph/search-indexer.js";
import { EmbeddingService, getEmbeddingService } from "./graph/embedding-service.js";
import { GlossaryService } from "./graph/glossary-service.js";
import { ActivationEngine } from "./brain/activation-engine.js";
import { WorkingMemoryManager } from "./brain/working-memory.js";
import { AssociativeNetwork } from "./brain/associative-network.js";
import { SyncEngine } from "./sync/sync-engine.js";
import { DreamConsolidation } from "./sync/dream-consolidation.js";
import { FileWatcher } from "./sync/watcher.js";
import { PromptInjector } from "./agent-bridge/prompt-injector.js";
import { DisclosureEngine } from "./agent-bridge/disclosure-engine.js";
import { getNamespaceContext } from "./agent-bridge/namespace-context.js";

export interface CceDownloadProgress {
  file: string;
  progress: number;
  loaded: number;
  total: number;
  speed: number;
}

export interface CceSystem {
  db: ReturnType<typeof getDbManager>;
  graph: GraphService;
  search: SearchIndexer;
  embedding: EmbeddingService;
  glossary: GlossaryService;
  activation: ActivationEngine;
  wm: WorkingMemoryManager;
  associative: AssociativeNetwork;
  sync: SyncEngine;
  dream: DreamConsolidation;
  watcher: FileWatcher;
  injector: PromptInjector;
  disclosure: DisclosureEngine;
}

let _system: CceSystem | null = null;
let _dreamTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the CCE core (DB, embedding model, graph, etc).
 * This is the heavy-lifting phase that may trigger model downloads.
 * Idempotent: returns cached system if already initialized.
 */
export async function initCceSystem(
  onProgress?: (msg: string) => void,
  onDownloadProgress?: (progress: CceDownloadProgress) => void,
): Promise<CceSystem> {
  if (_system) return _system;

  const namespace = getNamespaceContext().current;
  onProgress?.("Opening database...");
  const db = getDbManager(namespace);
  await initDb(db);

  onProgress?.("Loading embedding model (first run may download ~100 MB)...");
  const embedding = getEmbeddingService();
  await embedding.init((p) => {
    onDownloadProgress?.(p);
  });

  onProgress?.("Building search index...");
  const search = new SearchIndexer(db, embedding);
  const glossary = new GlossaryService(db, search);
  const graph = new GraphService(db, search);
  const activation = new ActivationEngine(db, search, glossary, graph);
  const wm = new WorkingMemoryManager(graph);
  setWorkingMemoryManager(wm);
  const associative = new AssociativeNetwork(db);
  const sync = new SyncEngine(graph, search);
  const dream = new DreamConsolidation(db, graph);
  const watcher = new FileWatcher();
  const disclosure = new DisclosureEngine(graph, glossary);
  const injector = new PromptInjector(graph, wm, activation, disclosure);

  _system = {
    db,
    graph,
    search,
    embedding,
    glossary,
    activation,
    wm,
    associative,
    sync,
    dream,
    watcher,
    injector,
    disclosure,
  };

  return _system;
}

/**
 * Start background services (file watcher + dream timer).
 * Call this after initCceSystem() completes.
 */
export function startCceServices(): void {
  if (!_system) return;
  const namespace = getNamespaceContext().current;
  const projectRoot = process.cwd();

  // 1. Register & start file watcher → sync events
  _system.watcher.registerProject(namespace, projectRoot, [".git", "node_modules", "dist", ".cce"]);
  _system.watcher.start(async (events) => {
    for (const ev of events) {
      try {
        if (ev.type === "modified") await _system!.sync.handleModify(ev.namespace, ev.path, projectRoot);
        else if (ev.type === "created") await _system!.sync.handleCreate(ev.namespace, ev.path, projectRoot);
        else if (ev.type === "deleted") await _system!.sync.handleDelete(ev.namespace, ev.path, projectRoot);
      } catch (err) {
        console.error("[CCE] Sync error:", err);
      }
    }
  });

  // 2. Dream consolidation every 30 minutes
  if (_dreamTimer) clearInterval(_dreamTimer);
  const DREAM_INTERVAL_MS = 30 * 60 * 1000;
  _dreamTimer = setInterval(() => {
    _system!.dream.run(namespace).catch((err: unknown) => console.error("[CCE] Dream error:", err));
  }, DREAM_INTERVAL_MS);
}

/**
 * Stop background services (file watcher + dream timer).
 * The DB and graph remain intact; call resetCceSystem() to fully tear down.
 */
export function stopCceServices(): void {
  if (!_system) return;
  _system.watcher.stop();
  if (_dreamTimer) {
    clearInterval(_dreamTimer);
    _dreamTimer = null;
  }
}

export function getCceSystem(): CceSystem | null {
  return _system;
}

export function isCceSystemReady(): boolean {
  return _system !== null;
}

export function resetCceSystem(): void {
  stopCceServices();
  if (_system) {
    try { _system.db.close(); } catch { /* ignore */ }
  }
  _system = null;
  getEmbeddingService().reset();
}

// Re-exports
export * from "./core/index.js";
export * from "./graph/index.js";
export { ActivationEngine, AssociativeNetwork } from "./brain/index.js";
export type { WorkingMemoryState, WorkingMemorySlot } from "./brain/index.js";
export * from "./sync/index.js";
export * from "./agent-bridge/index.js";

// Explicit re-exports to resolve ambiguity between core/types and submodules
export type { ScannedFile, TaskMarker } from "./core/index.js";
