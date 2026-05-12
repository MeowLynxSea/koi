/**
 * Hybrid Search Indexer for Cat's Context Engine.
 *
 * Combines FTS5 keyword search with vector semantic search,
 * fused via Reciprocal Rank Fusion (RRF).
 */

import type { DatabaseManager } from "../core/db.js";
import type { EmbeddingService } from "./embedding-service.js";

function expandQueryTerms(query: string): string {
  // Lightweight normalization
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .join(" ");
}

function buildDocumentSearchTerms(
  path: string,
  uri: string,
  content: string,
  disclosure: string | null,
  glossaryText: string
): string {
  const parts = [path, uri, content, disclosure || "", glossaryText];
  return expandQueryTerms(parts.join(" "));
}

function formatSearchSnippet(content: string, query: string): string {
  if (!content) return "";
  const contentLower = content.toLowerCase();
  const queryLower = query.toLowerCase();
  let pos = contentLower.indexOf(queryLower);
  let matchLen = query.length;
  if (pos < 0) {
    const tokens = expandQueryTerms(query).split(/\s+/);
    for (const token of tokens) {
      if (!token) continue;
      pos = contentLower.indexOf(token.toLowerCase());
      if (pos >= 0) {
        matchLen = token.length;
        break;
      }
    }
  }
  if (pos < 0) {
    return content.slice(0, 80) + (content.length > 80 ? "..." : "");
  }
  const start = Math.max(0, pos - 30);
  const end = Math.min(content.length, pos + matchLen + 30);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return prefix + content.slice(start, end) + suffix;
}

export class SearchIndexer {
  private fts5Available: boolean | null = null;

  constructor(
    private db: DatabaseManager,
    public embedding: EmbeddingService
  ) {}

  private async checkFts5(): Promise<boolean> {
    if (this.fts5Available !== null) return this.fts5Available;
    try {
      const row = await this.db.fetchone<[number]>(
        "SELECT 1 as n FROM sqlite_master WHERE type='table' AND name='context_vectors_fts'"
      );
      this.fts5Available = row?.[0] === 1;
    } catch {
      this.fts5Available = false;
    }
    return this.fts5Available;
  }

  private toFts5MatchQuery(query: string): string {
    const normalized = expandQueryTerms(query);
    const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      const raw = query.trim().replace(/"/g, '""');
      return raw ? `"${raw}"` : "";
    }
    return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" AND ");
  }

  // -----------------------------------------------------------------
  // Index maintenance
  // -----------------------------------------------------------------

  private async buildSearchDocumentsForNode(
    nodeUuid: string,
    namespace = "",
    searchAllNamespaces = false
  ): Promise<Array<Record<string, unknown>>> {
    const memoryRow = await this.db.fetchone<[number, string]>(
      `SELECT id, content FROM memories WHERE node_uuid = ? AND deprecated = 0 ORDER BY created_at DESC LIMIT 1`,
      [nodeUuid]
    );
    if (!memoryRow) return [];
    const [memoryId, content] = memoryRow;

    let pathSql: string;
    let pathParams: unknown[];
    if (searchAllNamespaces) {
      pathSql = `SELECT p.namespace, p.domain, p.path, e.priority, e.disclosure
                 FROM paths p JOIN edges e ON p.edge_id = e.id WHERE e.child_uuid = ? ORDER BY p.domain, p.path`;
      pathParams = [nodeUuid];
    } else {
      pathSql = `SELECT p.namespace, p.domain, p.path, e.priority, e.disclosure
                 FROM paths p JOIN edges e ON p.edge_id = e.id WHERE e.child_uuid = ? AND p.namespace = ? ORDER BY p.domain, p.path`;
      pathParams = [nodeUuid, namespace];
    }
    const pathRows = await this.db.fetchall<[string, string, string, number, string | null]>(pathSql, pathParams);
    if (pathRows.length === 0) return [];

    let kwSql: string;
    let kwParams: unknown[];
    if (searchAllNamespaces) {
      kwSql = `SELECT keyword, namespace FROM glossary_keywords WHERE node_uuid = ?`;
      kwParams = [nodeUuid];
    } else {
      kwSql = `SELECT keyword, namespace FROM glossary_keywords WHERE node_uuid = ? AND namespace = ?`;
      kwParams = [nodeUuid, namespace];
    }
    const keywordRows = await this.db.fetchall<[string, string]>(kwSql, kwParams);
    const keywordsByNs = new Map<string, string[]>();
    for (const [kw, ns] of keywordRows) {
      if (!keywordsByNs.has(ns)) keywordsByNs.set(ns, []);
      keywordsByNs.get(ns)!.push(kw);
    }

    const documents: Array<Record<string, unknown>> = [];
    for (const [ns, dom, pathStr, priority, disclosure] of pathRows) {
      const uri = `${dom}://${pathStr}`;
      const nsKeywords = keywordsByNs.get(ns) ?? [];
      const glossaryText = nsKeywords.sort().join(" ");
      documents.push({
        namespace: ns,
        domain: dom,
        path: pathStr,
        node_uuid: nodeUuid,
        memory_id: memoryId,
        uri,
        content,
        disclosure,
        search_terms: buildDocumentSearchTerms(pathStr, uri, content, disclosure, glossaryText),
        priority,
      });
    }
    return documents;
  }

  private async deleteSearchDocumentsForNode(
    nodeUuid: string,
    namespace = "",
    searchAllNamespaces = false
  ): Promise<void> {
    if (searchAllNamespaces) {
      await this.db.execute("DELETE FROM context_vectors WHERE node_uuid = ?", [nodeUuid]);
    } else {
      await this.db.execute("DELETE FROM context_vectors WHERE node_uuid = ? AND namespace = ?", [nodeUuid, namespace]);
    }
  }

  private async insertSearchDocuments(documents: Array<Record<string, unknown>>): Promise<void> {
    if (documents.length === 0) return;

    const texts = documents.map((d) => `${String(d['uri'])} ${String(d['content'])} ${(d['disclosure'] as string) || ""}`);
    const embeddings = await this.embedding.embed(texts);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]!;
      const emb = embeddings[i]!;
      const embBuf = this.embedding.serialize(emb);
      await this.db.execute(
        `INSERT INTO context_vectors
         (namespace, domain, path, node_uuid, memory_id, uri, content, disclosure, search_terms, priority, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc['namespace'],
          doc['domain'],
          doc['path'],
          doc['node_uuid'],
          doc['memory_id'],
          doc['uri'],
          doc['content'],
          doc['disclosure'],
          doc['search_terms'],
          doc['priority'],
          embBuf,
        ]
      );
    }
  }

  async refreshSearchDocumentsForNode(
    nodeUuid: string,
    namespace = "",
    refreshAllNamespaces = false
  ): Promise<void> {
    const documents = await this.buildSearchDocumentsForNode(nodeUuid, namespace, refreshAllNamespaces);
    await this.deleteSearchDocumentsForNode(nodeUuid, namespace, refreshAllNamespaces);
    await this.insertSearchDocuments(documents);
  }

  async rebuildAllSearchDocuments(): Promise<void> {
    await this.db.execute("DELETE FROM context_vectors");
    const rows = await this.db.fetchall<[string]>(
      `SELECT DISTINCT e.child_uuid FROM paths p JOIN edges e ON p.edge_id = e.id`
    );
    for (const [nodeUuid] of rows) {
      const documents = await this.buildSearchDocumentsForNode(nodeUuid, "", true);
      await this.insertSearchDocuments(documents);
    }
  }

  // -----------------------------------------------------------------
  // Public search API
  // -----------------------------------------------------------------

  async search(
    query: string,
    limit = 10,
    domain: string | null = null,
    namespace = ""
  ): Promise<Array<Record<string, unknown>>> {
    const keywordResults = await this.keywordSearch(query, limit * 3, domain, namespace);
    const queryEmbedding = await this.embedding.embedSingle(query);
    const vectorResults = await this.vectorSearch(queryEmbedding, limit * 3, domain, namespace);
    return this.rrfFuse(keywordResults, vectorResults, 60).slice(0, limit);
  }

  async keywordSearch(
    query: string,
    limit: number,
    domain: string | null,
    namespace: string
  ): Promise<Array<Record<string, unknown>>> {
    const useFts5 = await this.checkFts5();
    if (!useFts5) {
      // Fallback: LIKE-based search
      const safe = `%${query.toLowerCase().replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      const rows = await this.db.fetchall<[string, string, string, string, number, string, string | null]>(
        `SELECT domain, path, node_uuid, uri, priority, content, disclosure FROM context_vectors
         WHERE namespace = ? AND (LOWER(content) LIKE ? OR LOWER(path) LIKE ?)
         ${domain ? "AND domain = ?" : ""}
         ORDER BY priority ASC, LENGTH(path) ASC
         LIMIT ?`,
        domain ? [namespace, safe, safe, domain, limit] : [namespace, safe, safe, limit]
      );
      const seen = new Set<string>();
      const matches: Array<Record<string, unknown>> = [];
      for (const [dom, pathStr, nodeUuid, uri, priority, content, disclosure] of rows) {
        if (seen.has(nodeUuid)) continue;
        seen.add(nodeUuid);
        matches.push({
          domain: dom,
          path: pathStr,
          node_uuid: nodeUuid,
          uri,
          priority,
          snippet: formatSearchSnippet(content, query),
          disclosure,
          source: "keyword",
        });
      }
      return matches;
    }

    const matchQuery = this.toFts5MatchQuery(query);
    if (!matchQuery) return [];

    const params: unknown[] = [matchQuery, namespace];
    let domainClause = "";
    if (domain) {
      params.push(domain);
      domainClause = "AND cv.domain = ?";
    }
    params.push(limit);

    const rows = await this.db.fetchall<
      [string, string, string, string, number, string, string | null]
    >(
      `SELECT cv.domain, cv.path, cv.node_uuid, cv.uri, cv.priority, cv.content, cv.disclosure
       FROM context_vectors AS cv
       JOIN context_vectors_fts AS fts ON cv.rowid = fts.rowid
       WHERE fts.context_vectors_fts MATCH ? AND cv.namespace = ? ${domainClause}
       ORDER BY bm25(context_vectors_fts, 0.0, 0.0, 2.5, 0.0, 2.0, 1.0, 1.0, 0.75) ASC,
                cv.priority ASC, LENGTH(cv.path) ASC
       LIMIT ?`,
      params
    );

    const seen = new Set<string>();
    const matches: Array<Record<string, unknown>> = [];
    for (const [dom, pathStr, nodeUuid, uri, priority, content, disclosure] of rows) {
      if (seen.has(nodeUuid)) continue;
      seen.add(nodeUuid);
      matches.push({
        domain: dom,
        path: pathStr,
        node_uuid: nodeUuid,
        uri,
        priority,
        snippet: formatSearchSnippet(content, query),
        disclosure,
        source: "keyword",
      });
    }
    return matches;
  }

  async vectorSearch(
    queryEmbedding: Float32Array,
    limit: number,
    domain: string | null,
    namespace: string
  ): Promise<Array<Record<string, unknown>>> {
    const params: unknown[] = [namespace];
    let domainClause = "";
    if (domain) {
      params.push(domain);
      domainClause = "AND domain = ?";
    }
    params.push(limit * 3);

    const rows = await this.db.fetchall<
      [string, string, string, string, number, string, string | null, Buffer]
    >(
      `SELECT domain, path, node_uuid, uri, priority, content, disclosure, embedding
       FROM context_vectors
       WHERE namespace = ? AND embedding IS NOT NULL ${domainClause}
       LIMIT ?`,
      params
    );

    const scored: Array<{ item: Record<string, unknown>; distance: number }> = [];
    for (const [dom, pathStr, nodeUuid, uri, priority, content, disclosure, embBuf] of rows) {
      const emb = this.embedding.deserialize(embBuf);
      const dist = cosineDistance(queryEmbedding, emb);
      scored.push({
        item: {
          domain: dom,
          path: pathStr,
          node_uuid: nodeUuid,
          uri,
          priority,
          snippet: formatSearchSnippet(content, ""),
          disclosure,
          source: "vector",
        },
        distance: dist,
      });
    }

    scored.sort((a, b) => a.distance - b.distance);
    const seen = new Set<string>();
    const matches: Array<Record<string, unknown>> = [];
    for (const { item } of scored) {
      const nid = item['node_uuid'] as string;
      if (seen.has(nid)) continue;
      seen.add(nid);
      matches.push(item);
      if (matches.length >= limit) break;
    }
    return matches;
  }

  private rrfFuse(
    keywordResults: Array<Record<string, unknown>>,
    vectorResults: Array<Record<string, unknown>>,
    k = 60
  ): Array<Record<string, unknown>> {
    const scores = new Map<string, number>();
    const items = new Map<string, Record<string, unknown>>();

    for (let rank = 0; rank < keywordResults.length; rank++) {
      const kr = keywordResults[rank]!;
      const key = kr['node_uuid'] as string;
      scores.set(key, (scores.get(key) || 0) + 1 / (k + rank + 1));
      if (!items.has(key)) items.set(key, kr);
    }

    for (let rank = 0; rank < vectorResults.length; rank++) {
      const vr = vectorResults[rank]!;
      const key = vr['node_uuid'] as string;
      scores.set(key, (scores.get(key) || 0) + 1 / (k + rank + 1));
      if (!items.has(key)) items.set(key, vr);
    }

    const sortedKeys = Array.from(scores.keys()).sort((a, b) => scores.get(b)! - scores.get(a)!);
    const maxScore = Math.max(...Array.from(scores.values()), 1.0);
    return sortedKeys.map((key) => ({
      ...items.get(key)!,
      score: Math.min(1.0, scores.get(key)! / maxScore),
    }));
  }
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}
