/**
 * Activation Engine — Computes how strongly each memory node should be
 * activated by a given query (conversation utterance).
 *
 * Formula:
 *     activation(node) =
 *         semantic_similarity(query, node) × 0.35
 *       + keyword_match(query, node) × 0.25
 *       + neighbor_propagation(node) × 0.20
 *       + recency_bonus(node) × 0.10
 *       + baseline_importance(node) × 0.10
 */

import type { DatabaseManager } from "../core/db.js";
import type { SearchIndexer } from "../graph/search-indexer.js";
import type { GlossaryService } from "../graph/glossary-service.js";
import type { GraphService } from "../graph/graph-service.js";

export interface ActivationResult {
  node_uuid: string;
  uri: string | null;
  score: number;
  components: {
    semantic: number;
    keyword: number;
    neighbor: number;
    recency: number;
    baseline: number;
  };
}

export class ActivationEngine {
  private static readonly W_SEMANTIC = 0.35;
  private static readonly W_KEYWORD = 0.25;
  private static readonly W_NEIGHBOR = 0.20;
  private static readonly W_RECENCY = 0.10;
  private static readonly W_BASELINE = 0.10;
  private static readonly RECENCY_HALFLIFE = 24.0; // hours

  constructor(
    private db: DatabaseManager,
    private search: SearchIndexer,
    private glossary: GlossaryService,
    private graph: GraphService
  ) {}

  async computeActivations(
    queryText: string,
    namespace = "",
    topK = 50,
    _neighborDepth = 1,
    neighborDecay = 0.5,
    minScore = 0.05
  ): Promise<ActivationResult[]> {
    // 1. Semantic candidates
    const queryEmbedding = await this.search.embedding.embedSingle(queryText);
    const vectorResults = await this.search.vectorSearch(queryEmbedding, topK, null, namespace);

    // 2. Keyword candidates
    const keywordResults = await this.search.keywordSearch(queryText, topK, null, namespace);

    // 3. Glossary-triggered candidates
    const glossaryMatches = await this.glossary.findGlossaryInContent(queryText, namespace);
    const glossaryNodes = new Set<string>();
    for (const nodes of glossaryMatches.values()) {
      for (const n of nodes) glossaryNodes.add(n.node_uuid);
    }

    // Collect candidate node_uuids
    const candidateUuids = new Set<string>();
    const candidateData = new Map<
      string,
      { node_uuid: string; uri: string | null; semantic_rank: number | null; keyword_rank: number | null; glossary_hit: boolean }
    >();

    for (let i = 0; i < vectorResults.length; i++) {
      const r = vectorResults[i]!;
      const uid = r['node_uuid'] as string;
      candidateUuids.add(uid);
      candidateData.set(uid, {
        node_uuid: uid,
        uri: (r['uri'] as string) || null,
        semantic_rank: i,
        keyword_rank: null,
        glossary_hit: false,
      });
    }

    for (let i = 0; i < keywordResults.length; i++) {
      const r = keywordResults[i]!;
      const uid = r['node_uuid'] as string;
      if (!candidateUuids.has(uid)) {
        candidateUuids.add(uid);
        candidateData.set(uid, {
          node_uuid: uid,
          uri: (r['uri'] as string) || null,
          semantic_rank: null,
          keyword_rank: i,
          glossary_hit: false,
        });
      } else {
        candidateData.get(uid)!.keyword_rank = i;
      }
    }

    for (const uid of glossaryNodes) {
      if (!candidateUuids.has(uid)) {
        const pathRows = await this.db.fetchall<[string, string]>(
          `SELECT p.domain, p.path FROM paths p
           JOIN edges e ON p.edge_id = e.id
           WHERE e.child_uuid = ? AND p.namespace = ? LIMIT 1`,
          [uid, namespace]
        );
        const uri = pathRows.length > 0 ? `${pathRows[0]![0]}://${pathRows[0]![1]}` : null;
        candidateUuids.add(uid);
        candidateData.set(uid, {
          node_uuid: uid,
          uri,
          semantic_rank: null,
          keyword_rank: null,
          glossary_hit: true,
        });
      }
    }

    if (candidateUuids.size === 0) return [];

    // 4. Batch-fetch activation states
    const placeholders = Array.from(candidateUuids).map(() => "?").join(",");
    const activationRows = await this.db.fetchall<
      [string, number | null, number | null, number | null, string | null]
    >(
      `SELECT node_uuid, baseline_activation, current_activation, total_activation_count, last_activated_at
       FROM node_activation WHERE node_uuid IN (${placeholders})`,
      Array.from(candidateUuids)
    );
    const activationMap = new Map<
      string,
      { baseline: number; current: number; total_count: number; last_activated_at: string | null }
    >();
    for (const [uuid, baseline, current, total, last] of activationRows) {
      activationMap.set(uuid, {
        baseline: baseline ?? 0,
        current: current ?? 0,
        total_count: total ?? 0,
        last_activated_at: last,
      });
    }

    const now = new Date();

    // 5. Compute component scores
    const scores = new Map<
      string,
      { semantic: number; keyword: number; recency: number; baseline: number; neighbor: number; uri: string | null }
    >();

    for (const [uid, data] of candidateData) {
      const act = activationMap.get(uid);

      const semRank = data.semantic_rank;
      const semanticScore = semRank !== null ? 1.0 / (1.0 + semRank) : 0;

      const kwRank = data.keyword_rank;
      const keywordScore = kwRank !== null ? 1.0 / (1.0 + kwRank) : data.glossary_hit ? 0.8 : 0;

      let recencyScore = 0;
      const lastAct = act?.last_activated_at;
      if (lastAct) {
        try {
          const lastDt = new Date(lastAct);
          const hoursAgo = Math.max(0, (now.getTime() - lastDt.getTime()) / 3600000);
          recencyScore = Math.exp(-hoursAgo / ActivationEngine.RECENCY_HALFLIFE);
        } catch {
          recencyScore = 0;
        }
      }

      const baselineScore = act?.baseline ?? 0;

      scores.set(uid, {
        semantic: semanticScore,
        keyword: keywordScore,
        recency: recencyScore,
        baseline: baselineScore,
        neighbor: 0,
        uri: data.uri,
      });
    }

    // 6. Neighbor propagation
    const seedUuids = Array.from(scores.entries())
      .filter(([, s]) => Math.max(s.semantic, s.keyword) > 0.3)
      .map(([uid]) => uid);

    const neighborScores = new Map<string, number>();
    for (const seed of seedUuids) {
      const seedScore = Math.max(scores.get(seed)!.semantic, scores.get(seed)!.keyword);
      const neighbors = await this.graph.getNeighbors(seed, 0.15, namespace);
      for (const n of neighbors) {
        if (n.node_uuid === seed) continue;
        const contrib = seedScore * n.weight * neighborDecay;
        neighborScores.set(n.node_uuid, (neighborScores.get(n.node_uuid) || 0) + contrib);
      }
    }

    for (const [uid, ns] of neighborScores) {
      if (scores.has(uid)) {
        scores.get(uid)!.neighbor = Math.min(1.0, ns);
      } else if (ns >= 0.2) {
        const pathRows = await this.db.fetchall<[string, string]>(
          `SELECT p.domain, p.path FROM paths p
           JOIN edges e ON p.edge_id = e.id
           WHERE e.child_uuid = ? AND p.namespace = ? LIMIT 1`,
          [uid, namespace]
        );
        const uri = pathRows.length > 0 ? `${pathRows[0]![0]}://${pathRows[0]![1]}` : null;
        scores.set(uid, {
          semantic: 0,
          keyword: 0,
          recency: 0,
          baseline: 0,
          neighbor: Math.min(1.0, ns),
          uri,
        });
      }
    }

    // 7. Composite score
    const results: ActivationResult[] = [];
    for (const [uid, comps] of scores) {
      const composite =
        comps.semantic * ActivationEngine.W_SEMANTIC +
        comps.keyword * ActivationEngine.W_KEYWORD +
        comps.neighbor * ActivationEngine.W_NEIGHBOR +
        comps.recency * ActivationEngine.W_RECENCY +
        comps.baseline * ActivationEngine.W_BASELINE;

      if (composite >= minScore) {
        results.push({
          node_uuid: uid,
          uri: comps.uri,
          score: Math.round(composite * 10000) / 10000,
          components: {
            semantic: Math.round(comps.semantic * 10000) / 10000,
            keyword: Math.round(comps.keyword * 10000) / 10000,
            neighbor: Math.round(comps.neighbor * 10000) / 10000,
            recency: Math.round(comps.recency * 10000) / 10000,
            baseline: Math.round(comps.baseline * 10000) / 10000,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
