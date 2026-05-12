/**
 * Sync Engine — decides how to update the memory graph when files change.
 *
 * Owns:
 * - Signature extraction and comparison
 * - LLM-based summarization
 * - Concept & task extraction
 * - Database writes
 */

import fs from "fs";
import path from "path";
import type { GraphService } from "../graph/graph-service.js";
import type { SearchIndexer } from "../graph/search-indexer.js";
import { scanProject, type ScannedFile, detectLanguage } from "./scanner.js";
import { callAuxiliaryModel } from "../../config/settings.js";

interface SummaryCache {
  get(hash: string): string | null;
  set(hash: string, summary: string, relPath: string): void;
  clear(): void;
  save(): void;
}

function loadSummaryCache(cachePath: string): SummaryCache {
  let data: Record<string, { summary: string; path: string }> = {};
  try {
    if (fs.existsSync(cachePath)) {
      data = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Record<string, { summary: string; path: string }>;
    }
  } catch {
    data = {};
  }
  return {
    get(hash: string) {
      return data[hash]?.summary ?? null;
    },
    set(hash: string, summary: string, relPath: string) {
      data[hash] = { summary, path: relPath };
    },
    clear() {
      data = {};
    },
    save() {
      try {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
      } catch {
        // ignore
      }
    },
  };
}

export type SyncStrategy = "smart" | "always" | "manual";

export class SyncEngine {
  private caches = new Map<string, SummaryCache>();

  constructor(
    private graph: GraphService,
    _search: SearchIndexer
  ) {}

  private getCache(namespace: string, projectRoot: string): SummaryCache {
    if (!this.caches.has(namespace)) {
      const cachePath = path.join(projectRoot, ".cce", "cache", "summaries.json");
      this.caches.set(namespace, loadSummaryCache(cachePath));
    }
    return this.caches.get(namespace)!;
  }

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  async handleCreate(namespace: string, filePath: string, projectRoot: string): Promise<void> {
    await this._syncSingleFile(namespace, filePath, projectRoot, "created");
  }

  async handleModify(namespace: string, filePath: string, projectRoot: string): Promise<void> {
    await this._syncSingleFile(namespace, filePath, projectRoot, "modified");
  }

  async handleDelete(namespace: string, filePath: string, projectRoot: string): Promise<void> {
    const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
    try {
      await this.graph.removePath(relPath, "code", namespace);
    } catch {
      // ignore
    }
  }

  async handleMove(namespace: string, oldPath: string, newPath: string, projectRoot: string): Promise<void> {
    await this.handleDelete(namespace, oldPath, projectRoot);
    await this.handleCreate(namespace, newPath, projectRoot);
  }

  // ------------------------------------------------------------------
  // Full project sync
  // ------------------------------------------------------------------

  async syncProject(
    namespace: string,
    projectRoot: string,
    strategy: SyncStrategy = "smart",
    fullResync = false
  ): Promise<{ files_scanned: number; code_nodes: number; concept_nodes: number }> {
    const scanned = scanProject(projectRoot);
    const cache = this.getCache(namespace, projectRoot);
    if (fullResync) cache.clear();

    if (scanned.length === 0) {
      return { files_scanned: 0, code_nodes: 0, concept_nodes: 0 };
    }

    let codeCount = 0;
    let conceptCount = 0;
    const fileSummaryMap: Array<{ path: string; summary: string }> = [];

    for (const sf of scanned) {
      if (strategy === "manual") continue;

      let summary = "";
      if (strategy === "smart") {
        const existing = await this.graph.getMemoryByPath(sf.rel_path, "code", namespace);
        if (existing) {
          const oldSigs = this._extractSignaturesFromMemory(existing['content'] as string);
          if (sf.signatures === oldSigs) {
            const oldSummary = this._extractSummaryFromMemory(existing['content'] as string);
            const newContent = this._buildMemoryContent(sf, oldSummary);
            if (newContent === existing['content']) {
              continue;
            }
            await this.graph.updateMemory(sf.rel_path, newContent, "code", namespace);
            codeCount++;
            continue;
          }
        }
      }

      summary = await this._summarizeOne(sf, cache);
      await this._writeCodeMemory(namespace, sf, summary);
      codeCount++;

      if (summary) {
        fileSummaryMap.push({ path: sf.rel_path, summary });
        const emerged = await this._maintainConceptsIncrementally(namespace, projectRoot, sf, summary);
        conceptCount += emerged;
      }
    }

    await this._writeSystemBoot(namespace, projectRoot, fileSummaryMap);
    cache.save();

    return { files_scanned: scanned.length, code_nodes: codeCount, concept_nodes: conceptCount };
  }

  // ------------------------------------------------------------------
  // Single-file sync
  // ------------------------------------------------------------------

  private async _syncSingleFile(
    namespace: string,
    filePath: string,
    projectRoot: string,
    _eventType: string
  ): Promise<void> {
    const { createHash } = await import("crypto");
    const pathObj = path.resolve(filePath);
    if (!fs.existsSync(pathObj)) return;

    let content: string;
    try {
      content = fs.readFileSync(pathObj, "utf-8");
    } catch {
      return;
    }

    const relPath = path.relative(projectRoot, pathObj).replace(/\\/g, "/");
    const language = detectLanguage(pathObj);
    const { extractSignatures, extractTasks } = await import("./scanner.js");
    const signatures = extractSignatures(content, language);
    const tasks = extractTasks(content, relPath);
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);

    const sf: ScannedFile = {
      path: pathObj,
      rel_path: relPath,
      language,
      size_bytes: content.length,
      content_hash: contentHash,
      signatures,
      tasks,
      content_preview: content.slice(0, 500),
      content,
    };

    const cache = this.getCache(namespace, projectRoot);
    const summary = await this._summarizeOne(sf, cache);
    await this._writeCodeMemory(namespace, sf, summary);
    await this._maintainConceptsIncrementally(namespace, projectRoot, sf, summary);
  }

  // ------------------------------------------------------------------
  // LLM summarization
  // ------------------------------------------------------------------

  private async _summarizeOne(sf: ScannedFile, cache: SummaryCache): Promise<string> {
    const cached = cache.get(sf.content_hash);
    if (cached !== null) return cached;
    if (sf.size_bytes > 500_000) {
      const summary = `Large file (${Math.round(sf.size_bytes / 1024)} KB). Skipped LLM summary.`;
      cache.set(sf.content_hash, summary, sf.rel_path);
      return summary;
    }

    try {
      const prompt = `Summarize the following code file in 2-3 sentences. Focus on its purpose and key components.

File: ${sf.rel_path}
Language: ${sf.language}
${sf.signatures ? `Signatures:\n${sf.signatures}\n` : ""}
Content preview:
${sf.content_preview}`;

      const result = await callAuxiliaryModel(
        "You are a code summarization assistant. Be concise.",
        [{ role: "user", content: prompt, timestamp: Date.now() }]
      );
      const summary = result?.trim() || "";
      cache.set(sf.content_hash, summary, sf.rel_path);
      return summary;
    } catch {
      return "";
    }
  }

  // ------------------------------------------------------------------
  // Incremental concept maintenance
  // ------------------------------------------------------------------

  private async _maintainConceptsIncrementally(
    namespace: string,
    projectRoot: string,
    changedSf: ScannedFile,
    changedSummary: string
  ): Promise<number> {
    const codeNode = await this.graph.getMemoryByPath(changedSf.rel_path, "code", namespace);
    if (!codeNode) return 0;
    const codeUuid = codeNode['node_uuid'] as string;

    // 1. Verify existing concepts
    const affectedConcepts = await this.graph.getConceptsByEvidence(codeUuid);
    for (const concept of affectedConcepts) {
      await this.graph.verifyConceptEvidence(concept['concept_uuid'] as string);
    }

    // 2. Detect emerging patterns via keyword co-occurrence
    const newPatterns = await this._detectEmergingPatterns(namespace, changedSf, changedSummary);

    // 3. Emerge new concepts
    let emerged = 0;
    for (const pattern of newPatterns) {
      if ((pattern['confidence'] as number) > 0.6) {
        try {
          await this._emergeConcept(namespace, projectRoot, pattern, codeUuid);
          emerged++;
        } catch {
          // ignore
        }
      }
    }
    return emerged;
  }

  private async _detectEmergingPatterns(
    namespace: string,
    changedSf: ScannedFile,
    changedSummary: string
  ): Promise<Array<Record<string, unknown>>> {
    const keywords = new Set<string>();
    const re = /[A-Za-z_][A-Za-z0-9_]*/g;
    let m: RegExpExecArray | null;
    const sigText = changedSf.signatures || "";
    while ((m = re.exec(sigText)) !== null) {
      if (m[0].length > 3 && !["self", "return", "async", "await", "class", "def", "import", "from", "function", "const", "let", "var"].includes(m[0])) {
        keywords.add(m[0].toLowerCase());
      }
    }
    while ((m = re.exec(changedSummary)) !== null) {
      if (m[0].length > 3) keywords.add(m[0].toLowerCase());
    }
    if (keywords.size === 0) return [];

    const parentDir = changedSf.rel_path.includes("/") ? changedSf.rel_path.slice(0, changedSf.rel_path.lastIndexOf("/")) : "";
    const siblingPattern = parentDir ? `${parentDir}/%` : "%";

    const siblingRows = await this.graph["db"].fetchall<[string, string, string]>(
      `SELECT p.path, m.content, e.child_uuid
       FROM paths p
       JOIN edges e ON p.edge_id = e.id
       JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
       WHERE p.namespace = ? AND p.domain = 'code'
         AND p.path LIKE ? ESCAPE '\\'
         AND p.path != ?`,
      [namespace, siblingPattern.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%", changedSf.rel_path]
    );

    const patterns: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const [sibPath, sibContent, sibUuid] of siblingRows) {
      const sibKeywords = new Set<string>();
      let m2: RegExpExecArray | null;
      while ((m2 = re.exec(sibContent)) !== null) {
        if (m2[0].length > 3) sibKeywords.add(m2[0].toLowerCase());
      }
      const overlap = Array.from(keywords).filter((k) => sibKeywords.has(k));
      if (overlap.length >= 3) {
        const key = overlap.sort().join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        patterns.push({
          type: "keyword_cooccurrence",
          files: [changedSf.rel_path, sibPath],
          keywords: overlap,
          confidence: Math.min(1.0, overlap.length / 8.0),
          sibling_uuid: sibUuid,
        });
      }
    }

    return patterns;
  }

  private async _emergeConcept(
    namespace: string,
    _projectRoot: string,
    pattern: Record<string, unknown>,
    parentCodeUuid: string
  ): Promise<void> {
    const keywords = (pattern['keywords'] as string[]) || [];
    const tempName = keywords.slice(0, 3).sort().join("_") || "emerged_pattern";
    const tempTitle = `candidate_${tempName}`;
    const tempContent = `# Candidate Concept: ${tempName}\n\nKeywords: ${keywords.join(", ")}\nFiles: ${(pattern['files'] as string[]).join(", ")}\n\n(Awaiting Dream LLM naming)\n`;

    const parentMem = await this.graph.getMemoryByNodeUuid(parentCodeUuid, namespace);
    const parentPaths = parentMem ? (parentMem['paths'] as string[]) : [];
    const parentPath = parentPaths[0] ? parentPaths[0].split("://")[1] || "" : "";

    const result = await this.graph.createMemory(parentPath, tempContent, 2, tempTitle, null, "concept", namespace);
    const conceptUuid = result['node_uuid'] as string;

    for (const fpath of (pattern['files'] as string[]) || []) {
      const fileMem = await this.graph.getMemoryByPath(fpath, "code", namespace);
      if (fileMem) {
        await this.graph.addConceptEvidence(conceptUuid, fileMem['node_uuid'] as string, "keyword_cooccurrence", pattern['confidence'] as number);
      }
    }
  }

  // ------------------------------------------------------------------
  // DB writes
  // ------------------------------------------------------------------

  private async _writeCodeMemory(namespace: string, sf: ScannedFile, summary: string): Promise<void> {
    const content = this._buildMemoryContent(sf, summary);
    const existing = await this.graph.getMemoryByPath(sf.rel_path, "code", namespace);
    if (existing) {
      await this.graph.updateMemory(sf.rel_path, content, "code", namespace);
    } else {
      const parentPath = sf.rel_path.includes("/") ? sf.rel_path.slice(0, sf.rel_path.lastIndexOf("/")) : "";
      const title = sf.rel_path.includes("/") ? sf.rel_path.slice(sf.rel_path.lastIndexOf("/") + 1) : sf.rel_path;
      await this.graph.createMemory(parentPath, content, 0, title, null, "code", namespace);
    }
  }

  private _buildMemoryContent(sf: ScannedFile, summary: string): string {
    const lines = [`# ${sf.rel_path}`, ""];
    if (sf.signatures) {
      lines.push("## Signatures", sf.signatures, "");
    }
    lines.push("## Summary", summary, "");
    if (sf.tasks.length > 0) {
      lines.push("## Markers");
      for (const t of sf.tasks) {
        lines.push(`- [${t.kind}] ${t.text} (line ${t.line})`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  private async _writeSystemBoot(
    namespace: string,
    projectRoot: string,
    fileSummaryMap: Array<{ path: string; summary: string }>
  ): Promise<void> {
    const sorted = fileSummaryMap.sort((a, b) => b.summary.length - a.summary.length).slice(0, 20);
    const lines = [
      "# System Boot Context",
      "",
      `Project: ${namespace}`,
      `Root: ${projectRoot}`,
      "",
      "## Key Files",
    ];
    for (const item of sorted) {
      lines.push(`- ${item.path}: ${item.summary.slice(0, 120)}...`);
    }
    lines.push("", "## Protocols", "- Working Memory and context activation are handled automatically by the framework.", "- After code changes, affected code:// nodes are updated automatically.");

    const content = lines.join("\n");
    const existing = await this.graph.getMemoryByPath("boot", "system", namespace);
    if (existing) {
      await this.graph.updateMemory("boot", content, "system", namespace);
    } else {
      await this.graph.createMemory("", content, 0, "boot", null, "system", namespace);
    }
  }

  private _extractSignaturesFromMemory(memoryContent: string): string {
    const lines = memoryContent.split("\n");
    let inSigs = false;
    const result: string[] = [];
    for (const line of lines) {
      if (line.trim() === "## Signatures") {
        inSigs = true;
        continue;
      }
      if (inSigs) {
        if (line.startsWith("## ")) break;
        result.push(line);
      }
    }
    return result.join("\n").trim();
  }

  private _extractSummaryFromMemory(memoryContent: string): string {
    const lines = memoryContent.split("\n");
    let inSummary = false;
    const result: string[] = [];
    for (const line of lines) {
      if (line.trim() === "## Summary") {
        inSummary = true;
        continue;
      }
      if (inSummary) {
        if (line.startsWith("## ")) break;
        result.push(line);
      }
    }
    return result.join("\n").trim();
  }
}
