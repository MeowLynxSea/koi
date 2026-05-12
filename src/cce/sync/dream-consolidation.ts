/**
 * Dream Consolidation — Memory consolidation: the daemon's "sleep" phase.
 *
 * 1. Decay all node activations
 * 2. Replay recent episodes → Hebbian reinforcement of associative edges
 * 3. Name candidate concepts via LLM
 * 4. Verify and deprecate stale concepts
 * 5. Clean orphaned evidence
 */

import type { GraphService } from "../graph/graph-service.js";
import type { DatabaseManager } from "../core/db.js";
import { callAuxiliaryModel } from "../../config/settings.js";

export class DreamConsolidation {
  constructor(
    private db: DatabaseManager,
    private graph: GraphService
  ) {}

  async run(namespace: string): Promise<Record<string, number>> {
    const stats = { decayed: 0, reinforced: 0, named: 0, deprecated: 0, cleaned: 0 };

    // 1. Global activation decay
    const decayResult = await this.graph.decayActivations(0.95);
    stats.decayed = decayResult.active_nodes;

    // 2. Episode replay — Hebbian learning
    const recentEpisodes = await this.graph.getRecentEpisodes(50);
    if (recentEpisodes.length > 0) {
      const nodeGroups: string[][] = [];
      let currentGroup: Array<{ node_uuid: string; created_at: string }> = [];
      let lastTime: string | null = null;

      for (const ep of recentEpisodes) {
        const epTime = ep['created_at'] as string;
        if (lastTime && epTime) {
          try {
            const t1 = new Date(lastTime).getTime();
            const t2 = new Date(epTime).getTime();
            if (Math.abs(t1 - t2) > 300000) { // 5 min gap
              if (currentGroup.length > 1) {
                nodeGroups.push(currentGroup.map((e) => e.node_uuid as string));
              }
              currentGroup = [];
            }
          } catch {
            // ignore
          }
        }
        currentGroup.push(ep as { node_uuid: string; created_at: string });
        lastTime = epTime;
      }
      if (currentGroup.length > 1) {
        nodeGroups.push(currentGroup.map((e) => e.node_uuid as string));
      }

      for (const group of nodeGroups) {
        const unique = Array.from(new Set(group));
        if (unique.length > 1) {
          const result = await this.graph.reinforceEdgesByCoactivation(unique, 0.03);
          stats.reinforced += (result.reinforced || 0) + (result.created || 0);
        }
      }
    }

    // 3. Name candidate concepts
    const candidateRows = await this.db.fetchall<[string, string, string]>(
      `SELECT p.path, m.content, m.node_uuid
       FROM paths p
       JOIN edges e ON p.edge_id = e.id
       JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
       WHERE p.namespace = ? AND p.domain = 'concept'
         AND p.path LIKE '%candidate_%'
       LIMIT 20`,
      [namespace]
    );

    for (const [path, _content, nodeUuid] of candidateRows) {
      const evidence = await this.graph.getConceptEvidence(nodeUuid);
      if (!evidence || evidence.length === 0) continue;

      const fileSummaries: Array<{ path: string; summary: string }> = [];
      for (const ev of evidence) {
        const evNode = ev['evidence_node_uuid'] as string;
        const evMem = await this.graph.getMemoryByNodeUuid(evNode, namespace);
        if (evMem && (evMem['paths'] as string[])?.length > 0) {
          fileSummaries.push({
            path: (evMem['paths'] as string[])[0]!,
            summary: ((evMem['content'] as string) || "").slice(0, 500),
          });
        }
      }
      if (fileSummaries.length === 0) continue;

      try {
        const prompt = `Based on the following files, suggest a concise concept name (2-4 words) and a one-sentence description.

Files:
${fileSummaries.map((f) => `- ${f.path}: ${f.summary.slice(0, 200)}`).join("\n")}

Respond in this exact format:
Name: <concept_name>
Description: <one_sentence_description>
If no clear concept emerges, respond with "NO_CONCEPT".`;

        const raw = await callAuxiliaryModel(
          "You are a cognitive scientist naming memory patterns. Be concise.",
          [{ role: "user", content: prompt, timestamp: Date.now() }]
        );

        let name: string | null = null;
        let desc: string | null = null;
        for (const line of (raw || "").split("\n")) {
          const trimmed = line.trim();
          if (trimmed.toLowerCase().startsWith("name:")) {
            name = trimmed.slice(5).trim();
          } else if (trimmed.toLowerCase().startsWith("description:")) {
            desc = trimmed.slice(12).trim();
          }
        }
        if (name && name !== "NO_CONCEPT" && desc) {
          const newContent = `# ${name}\n\n${desc}\n`;
          await this.graph.updateMemory(path, newContent, "concept", namespace);
          stats.named++;
        }
      } catch {
        // ignore naming failure
      }
    }

    // 4. Verify and deprecate stale concepts
    const staleConcepts = await this.db.fetchall<[string, string]>(
      `SELECT p.path, m.node_uuid
       FROM paths p
       JOIN edges e ON p.edge_id = e.id
       JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
       LEFT JOIN concept_evidence ce ON ce.concept_node_uuid = m.node_uuid
       WHERE p.namespace = ? AND p.domain = 'concept'
       GROUP BY m.node_uuid
       HAVING MAX(COALESCE(ce.strength, 0)) < 0.3
          OR COUNT(ce.id) = 0
       LIMIT 10`,
      [namespace]
    );

    for (const [path, nodeUuid] of staleConcepts) {
      const act = await this.graph.getActivationState(nodeUuid);
      if (act && (act['baseline_activation'] as number) > 0.3) continue;
      try {
        const mem = await this.graph.getMemoryByPath(path, "concept", namespace);
        if (mem) {
          const oldContent = (mem['content'] as string) || "";
          if (!oldContent.includes("[STALE]")) {
            const newContent = oldContent + "\n\n> [STALE] This concept has lost evidence support and may be outdated.\n";
            await this.graph.updateMemory(path, newContent, "concept", namespace);
            stats.deprecated++;
          }
        }
      } catch {
        // ignore
      }
    }

    // 5. Clean orphaned concept_evidence rows
    await this.db.execute(
      `DELETE FROM concept_evidence
       WHERE evidence_node_uuid NOT IN (
         SELECT DISTINCT node_uuid FROM memories WHERE deprecated = 0
       )`
    );
    stats.cleaned = 1;

    return stats;
  }
}
