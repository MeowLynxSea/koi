/**
 * Associative Network — Hebbian learning, edge weight updates, co-activation
 */

import type { DatabaseManager } from "../core/db.js";

export class AssociativeNetwork {
  constructor(private db: DatabaseManager) {}

  async reinforce(sourceUuid: string, targetUuid: string, delta = 0.03): Promise<void> {
    const row = await this.db.fetchone<[number, number]>(
      `SELECT id, weight FROM associative_edges
       WHERE source_uuid = ? AND target_uuid = ? AND edge_type = 'associates'`,
      [sourceUuid, targetUuid]
    );
    const now = new Date().toISOString();
    if (row) {
      const newWeight = Math.min(1.0, row[1] + delta);
      await this.db.execute(
        `UPDATE associative_edges SET weight = ?, activation_count = activation_count + 1, last_activated_at = ? WHERE id = ?`,
        [newWeight, now, row[0]]
      );
    } else {
      await this.db.execute(
        `INSERT INTO associative_edges (source_uuid, target_uuid, edge_type, weight, last_activated_at) VALUES (?, ?, 'associates', ?, ?)`,
        [sourceUuid, targetUuid, Math.max(0.5, 0.5 + delta), now]
      );
    }
  }

  async propagate(
    sourceUuid: string,
    depth = 1,
    decay = 0.5,
    minWeight = 0.15
  ): Promise<Array<{ node_uuid: string; effective_weight: number; path: string[] }>> {
    const results: Array<{ node_uuid: string; effective_weight: number; path: string[] }> = [];
    const visited = new Map<string, { weight: number; path: string[] }>();
    visited.set(sourceUuid, { weight: 1.0, path: [sourceUuid] });

    let currentLayer = new Map<string, { weight: number; path: string[] }>();
    currentLayer.set(sourceUuid, { weight: 1.0, path: [sourceUuid] });

    for (let d = 0; d < depth && currentLayer.size > 0; d++) {
      const nextLayer = new Map<string, { weight: number; path: string[] }>();
      for (const [nodeUuid, data] of currentLayer) {
        const rows = await this.db.fetchall<[string, number]>(
          `SELECT target_uuid, weight FROM associative_edges WHERE source_uuid = ? AND weight >= ?
           UNION
           SELECT source_uuid, weight FROM associative_edges WHERE target_uuid = ? AND weight >= ?`,
          [nodeUuid, minWeight, nodeUuid, minWeight]
        );
        for (const [neighborUuid, weight] of rows) {
          if (neighborUuid === sourceUuid) continue;
          const effectiveWeight = data.weight * weight * decay;
          if (effectiveWeight < 0.05) continue;

          if (!visited.has(neighborUuid) || visited.get(neighborUuid)!.weight < effectiveWeight) {
            const path = [...data.path, neighborUuid];
            visited.set(neighborUuid, { weight: effectiveWeight, path });
            nextLayer.set(neighborUuid, { weight: effectiveWeight, path });
          }
        }
      }
      currentLayer = nextLayer;
    }

    for (const [nodeUuid, data] of visited) {
      if (nodeUuid === sourceUuid) continue;
      results.push({ node_uuid: nodeUuid, effective_weight: data.weight, path: data.path });
    }

    return results.sort((a, b) => b.effective_weight - a.effective_weight);
  }

  async getEdgeWeight(sourceUuid: string, targetUuid: string): Promise<number> {
    const row = await this.db.fetchone<[number]>(
      `SELECT weight FROM associative_edges WHERE source_uuid = ? AND target_uuid = ? AND edge_type = 'associates'`,
      [sourceUuid, targetUuid]
    );
    return row?.[0] ?? 0;
  }

  async getAllEdgesForNode(nodeUuid: string, minWeight = 0.0): Promise<Array<{ target_uuid: string; weight: number; edge_type: string }>> {
    const rows = await this.db.fetchall<[string, number, string]>(
      `SELECT target_uuid, weight, edge_type FROM associative_edges WHERE source_uuid = ? AND weight >= ?
       UNION
       SELECT source_uuid, weight, edge_type FROM associative_edges WHERE target_uuid = ? AND weight >= ?`,
      [nodeUuid, minWeight, nodeUuid, minWeight]
    );
    return rows.map(([uid, weight, type]) => ({ target_uuid: uid, weight, edge_type: type }));
  }
}
