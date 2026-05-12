/**
 * Working Memory Manager — Maintains the limited-capacity conscious buffer
 * for each namespace. Decides which memory nodes enter/leave WM based on
 * ActivationEngine scores.
 */

import type { GraphService } from "../graph/graph-service.js";

export interface WorkingMemorySlot {
  node_uuid: string;
  uri: string;
  content: string;
  injection_depth: "full" | "summary";
  activation_source: string;
  relevance_score: number;
  inserted_at: number;
  access_count: number;
}

export class WorkingMemoryState {
  slots: WorkingMemorySlot[] = [];
  last_updated: string | null = null;

  constructor(
    public namespace: string,
    public capacity: number
  ) {}

  insertOrReplace(candidate: WorkingMemorySlot, stickinessBoost = 0.05): { action: "inserted" | "refreshed" | "rejected"; evicted?: WorkingMemorySlot } {
    const existingIndex = this.slots.findIndex((s) => s.node_uuid === candidate.node_uuid);

    if (existingIndex >= 0) {
      // Refresh existing slot
      const existing = this.slots[existingIndex]!;
      existing.relevance_score = Math.max(existing.relevance_score, candidate.relevance_score);
      existing.activation_source = candidate.activation_source;
      existing.injection_depth = candidate.injection_depth;
      existing.content = candidate.content;
      existing.uri = candidate.uri;
      existing.access_count++;
      this.last_updated = new Date().toISOString();
      return { action: "refreshed" };
    }

    if (this.slots.length < this.capacity) {
      this.slots.push(candidate);
      this.last_updated = new Date().toISOString();
      return { action: "inserted" };
    }

    // Find weakest slot to evict
    let weakestIndex = -1;
    let weakestScore = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      const stickiness = slot.access_count * stickinessBoost;
      const effectiveScore = slot.relevance_score - stickiness;
      if (effectiveScore < weakestScore) {
        weakestScore = effectiveScore;
        weakestIndex = i;
      }
    }

    if (weakestIndex >= 0 && candidate.relevance_score > this.slots[weakestIndex]!.relevance_score) {
      const evicted = this.slots[weakestIndex]!;
      this.slots[weakestIndex] = candidate;
      this.last_updated = new Date().toISOString();
      return { action: "inserted", evicted };
    }

    return { action: "rejected" };
  }

  formatForAgent(): string {
    if (this.slots.length === 0) return "";
    const lines = ["=== Working Memory ===", ""];
    for (const slot of this.slots) {
      const depthLabel = slot.injection_depth === "full" ? "[FULL]" : "[SUMMARY]";
      lines.push(`${depthLabel} ${slot.uri} (score: ${slot.relevance_score.toFixed(2)}, source: ${slot.activation_source})`);
      if (slot.injection_depth === "full") {
        lines.push(slot.content);
      } else {
        const summary = slot.content.split("\n").slice(0, 3).join(" ").slice(0, 200);
        lines.push(summary + (slot.content.length > 200 ? "..." : ""));
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  toDict(): Record<string, unknown> {
    return {
      namespace: this.namespace,
      capacity: this.capacity,
      occupied: this.slots.length,
      slots: this.slots.map((s) => ({
        node_uuid: s.node_uuid,
        uri: s.uri,
        relevance_score: s.relevance_score,
        activation_source: s.activation_source,
        injection_depth: s.injection_depth,
      })),
      last_updated: this.last_updated,
    };
  }
}

export class WorkingMemoryManager {
  private pools = new Map<string, WorkingMemoryState>();

  constructor(
    private graph: GraphService,
    private capacity = 12
  ) {}

  getPool(namespace: string): WorkingMemoryState {
    if (!this.pools.has(namespace)) {
      this.pools.set(namespace, new WorkingMemoryState(namespace, this.capacity));
    }
    return this.pools.get(namespace)!;
  }

  async updateFromActivations(
    namespace: string,
    activatedNodes: Array<{ node_uuid: string; uri: string | null; score: number; components: Record<string, number> }>,
    _queryText = ""
  ): Promise<{ inserted: string[]; refreshed: string[]; evicted: string[]; rejected: string[]; activated_nodes: Array<Record<string, unknown>> }> {
    const pool = this.getPool(namespace);
    const changes = { inserted: [] as string[], refreshed: [] as string[], evicted: [] as string[], rejected: [] as string[], activated_nodes: [] as Array<Record<string, unknown>> };

    for (const candidate of activatedNodes) {
      const nodeUuid = candidate.node_uuid;
      const uri = candidate.uri || "unknown://unknown";
      const score = candidate.score ?? 0;
      const source = this.dominantSource(candidate.components);

      const content = await this.resolveContent(nodeUuid, namespace);
      if (!content) continue;

      const slot: WorkingMemorySlot = {
        node_uuid: nodeUuid,
        uri,
        content,
        injection_depth: score > 0.7 ? "full" : "summary",
        activation_source: source,
        relevance_score: score,
        inserted_at: Date.now(),
        access_count: 0,
      };

      const result = pool.insertOrReplace(slot, 0.05);

      if (result.action === "inserted") {
        changes.inserted.push(uri);
        if (result.evicted) changes.evicted.push(result.evicted.uri);
      } else if (result.action === "refreshed") {
        changes.refreshed.push(uri);
      } else {
        changes.rejected.push(uri);
      }

      if (result.action === "inserted" || result.action === "refreshed") {
        try {
          await this.graph.activateNode(nodeUuid, uri, Math.min(1.0, score), false);
          changes.activated_nodes.push({ node_uuid: nodeUuid, uri, score, action: result.action });
        } catch {
          // ignore
        }
      }
    }

    pool.last_updated = new Date().toISOString();
    return changes;
  }

  private async resolveContent(nodeUuid: string, namespace: string): Promise<string> {
    try {
      const memory = await this.graph.getMemoryByNodeUuid(nodeUuid, namespace);
      if (memory) return (memory['content'] as string) || "";
    } catch {
      // ignore
    }
    return "";
  }

  private dominantSource(components: Record<string, number>): string {
    if (!components || Object.keys(components).length === 0) return "unknown";
    const dominant = Object.entries(components).sort((a, b) => b[1] - a[1])[0]![0];
    const map: Record<string, string> = {
      semantic: "similarity",
      keyword: "keyword",
      neighbor: "neighbor",
      recency: "recency",
      baseline: "baseline",
    };
    return map[dominant] || "unknown";
  }

  formatPool(namespace: string): string {
    return this.getPool(namespace).formatForAgent();
  }

  getPoolDict(namespace: string): Record<string, unknown> {
    return this.getPool(namespace).toDict();
  }

  async manualInject(namespace: string, uri: string, content: string, score = 0.95): Promise<Record<string, unknown>> {
    const pool = this.getPool(namespace);

    let nodeUuid: string | null = null;
    try {
      const parts = uri.split("://");
      if (parts.length === 2) {
        const mem = await this.graph.getMemoryByPath(parts[1]!, parts[0]!, namespace);
        if (mem) nodeUuid = mem['node_uuid'] as string;
      }
    } catch {
      // ignore
    }

    if (!nodeUuid) {
      const { randomUUID } = await import("crypto");
      nodeUuid = randomUUID();
    }

    const slot: WorkingMemorySlot = {
      node_uuid: nodeUuid,
      uri,
      content,
      injection_depth: "full",
      activation_source: "manual",
      relevance_score: score,
      inserted_at: Date.now(),
      access_count: 0,
    };
    return pool.insertOrReplace(slot, 0.15);
  }
}

let _wmInstance: WorkingMemoryManager | null = null;

export function getWorkingMemoryManager(): WorkingMemoryManager | null {
  return _wmInstance;
}

export function setWorkingMemoryManager(wm: WorkingMemoryManager): void {
  _wmInstance = wm;
}
