/**
 * Graph Service for Cat's Context Engine
 *
 * Graph-based context storage with:
 * - Node: a conceptual entity (UUID), version-independent
 * - Memory: a content version of a node
 * - Edge: parent→child relationship between nodes, carrying metadata
 * - Path: materialized URI cache (domain://path → edge)
 */

import { randomUUID } from "crypto";
import { ROOT_NODE_UUID } from "../core/types.js";
import type { DatabaseManager } from "../core/db.js";
import type { SearchIndexer } from "./search-indexer.js";

function escapeLikeLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export class GraphService {
  constructor(
    private db: DatabaseManager,
    private search: SearchIndexer
  ) {}

  // =========================================================================
  // Read Operations
  // =========================================================================

  async getMemoryByPath(
    path: string,
    domain = "code",
    namespace = ""
  ): Promise<Record<string, unknown> | null> {
    if (path === "") {
      return {
        id: 0,
        node_uuid: ROOT_NODE_UUID,
        content: `Root node for domain '${domain}'.`,
        priority: 0,
        disclosure: null,
        deprecated: false,
        created_at: null,
        domain,
        path: "",
        alias_count: 0,
      };
    }

    const row = await this.db.fetchone<
      [number, string, string, number, number, string | null, string, string]
    >(
      `SELECT m.id, m.node_uuid, m.content, m.deprecated, e.priority, e.disclosure, p.domain, p.path
       FROM paths p
       JOIN edges e ON p.edge_id = e.id
       JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
       WHERE p.namespace = ? AND p.domain = ? AND p.path = ?
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [namespace, domain, path]
    );

    if (!row) return null;

    const aliasCount = Math.max(0, (await this._countIncomingPaths(row[1], namespace)) - 1);

    return {
      id: row[0],
      node_uuid: row[1],
      content: row[2],
      priority: row[4],
      disclosure: row[5],
      deprecated: Boolean(row[3]),
      created_at: row[3],
      domain: row[6],
      path: row[7],
      alias_count: aliasCount,
    };
  }

  async getPathsForNode(
    nodeUuid: string,
    namespace = "",
    searchAllNamespaces = false
  ): Promise<Array<{ domain: string; path: string; namespace: string; uri: string }>> {
    const sql = searchAllNamespaces
      ? `SELECT p.domain, p.path, p.namespace FROM paths p
         JOIN edges e ON p.edge_id = e.id WHERE e.child_uuid = ?`
      : `SELECT p.domain, p.path, p.namespace FROM paths p
         JOIN edges e ON p.edge_id = e.id WHERE e.child_uuid = ? AND p.namespace = ?`;
    const params = searchAllNamespaces ? [nodeUuid] : [nodeUuid, namespace];
    const rows = await this.db.fetchall<[string, string, string]>(sql, params);

    const paths: Array<{ domain: string; path: string; namespace: string; uri: string }> = [];
    const seen = new Set<string>();
    for (const [domain, pathStr, ns] of rows) {
      const key = `${ns}::${domain}::${pathStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push({ domain, path: pathStr, namespace: ns, uri: `${domain}://${pathStr}` });
    }
    return paths;
  }

  async getMemoryByNodeUuid(
    nodeUuid: string,
    namespace = "",
    searchAllNamespaces = false
  ): Promise<Record<string, unknown> | null> {
    const row = await this.db.fetchone<[number, string, number, string]>(
      `SELECT id, content, deprecated, created_at FROM memories
       WHERE node_uuid = ? AND deprecated = 0 ORDER BY created_at DESC LIMIT 1`,
      [nodeUuid]
    );
    if (!row) return null;

    const pathsData = await this.getPathsForNode(nodeUuid, namespace, searchAllNamespaces);
    const paths = pathsData.map((p) => p.uri);

    return {
      id: row[0],
      node_uuid: nodeUuid,
      content: row[1],
      deprecated: Boolean(row[2]),
      created_at: row[3],
      paths,
    };
  }

  async getChildren(
    nodeUuid = ROOT_NODE_UUID,
    contextDomain: string | null = null,
    contextPath: string | null = null,
    namespace = ""
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<
      [number, string, string, number, string | null, string]
    >(
      `SELECT e.id, e.child_uuid, e.name, e.priority, e.disclosure, m.content
       FROM edges e
       JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
       WHERE e.parent_uuid = ?
       ORDER BY e.priority ASC, e.name ASC`,
      [nodeUuid]
    );

    const prefix = contextPath ? `${contextPath}/` : null;
    const children: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const [edgeId, childUuid, name, priority, disclosure, content] of rows) {
      if (seen.has(childUuid)) continue;
      seen.add(childUuid);

      const pathRows = await this.db.fetchall<[string, string]>(
        `SELECT domain, path FROM paths WHERE namespace = ? AND edge_id = ?`,
        [namespace, edgeId]
      );

      if (nodeUuid === ROOT_NODE_UUID && contextDomain) {
        const hasDomainPath = pathRows.some(([d]) => d === contextDomain);
        if (!hasDomainPath) continue;
      }

      const pathObj = this._pickBestPath(pathRows, contextDomain, prefix);
      if (!pathObj) continue;

      const approxChildren = await this._countChildrenApprox(childUuid, namespace);

      children.push({
        node_uuid: childUuid,
        edge_id: edgeId,
        name,
        domain: pathObj[0],
        path: pathObj[1],
        content_snippet: content.length > 100 ? content.slice(0, 100) + "..." : content,
        priority,
        disclosure,
        approx_children_count: approxChildren,
      });
    }

    return children;
  }

  private _pickBestPath(
    paths: Array<[string, string]>,
    contextDomain: string | null,
    prefix: string | null
  ): [string, string] | null {
    if (paths.length === 0) return null;
    if (paths.length === 1) return paths[0] ?? null;

    if (contextDomain && prefix) {
      for (const [domain, pathStr] of paths) {
        if (domain === contextDomain && pathStr.startsWith(prefix)) return [domain, pathStr];
      }
    }
    if (contextDomain) {
      for (const [domain, pathStr] of paths) {
        if (domain === contextDomain) return [domain, pathStr];
      }
    }
    return paths[0] ?? null;
  }

  private async _countChildrenApprox(nodeUuid: string, namespace: string): Promise<number> {
    const row = await this.db.fetchone<[number]>(
      `SELECT COUNT(DISTINCT e.id) FROM edges e
       JOIN paths p ON p.edge_id = e.id
       WHERE e.parent_uuid = ? AND p.namespace = ?`,
      [nodeUuid, namespace]
    );
    return row?.[0] ?? 0;
  }

  async getAllPaths(
    domain: string | null = null,
    namespace = "",
    searchAllNamespaces = false
  ): Promise<Array<Record<string, unknown>>> {
    let sql: string;
    let params: unknown[];

    if (searchAllNamespaces) {
      if (domain) {
        sql = `SELECT p.namespace, p.domain, p.path, e.child_uuid, e.priority, m.id
               FROM paths p JOIN edges e ON p.edge_id = e.id
               JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
               WHERE p.domain = ? ORDER BY p.domain, p.path`;
        params = [domain];
      } else {
        sql = `SELECT p.namespace, p.domain, p.path, e.child_uuid, e.priority, m.id
               FROM paths p JOIN edges e ON p.edge_id = e.id
               JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
               ORDER BY p.domain, p.path`;
        params = [];
      }
    } else {
      if (domain) {
        sql = `SELECT p.namespace, p.domain, p.path, e.child_uuid, e.priority, m.id
               FROM paths p JOIN edges e ON p.edge_id = e.id
               JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
               WHERE p.namespace = ? AND p.domain = ? ORDER BY p.domain, p.path`;
        params = [namespace, domain];
      } else {
        sql = `SELECT p.namespace, p.domain, p.path, e.child_uuid, e.priority, m.id
               FROM paths p JOIN edges e ON p.edge_id = e.id
               JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
               WHERE p.namespace = ? ORDER BY p.domain, p.path`;
        params = [namespace];
      }
    }

    const rows = await this.db.fetchall<[string, string, string, string, number, number]>(sql, params);
    const paths: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const [ns, dom, pathStr, childUuid, priority, memoryId] of rows) {
      const key = `${ns}::${dom}::${pathStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push({
        namespace: ns,
        domain: dom,
        path: pathStr,
        uri: `${dom}://${pathStr}`,
        name: pathStr ? pathStr.split("/").pop() : "",
        priority,
        memory_id: memoryId,
        node_uuid: childUuid,
      });
    }
    return paths;
  }

  // =========================================================================
  // Layer 0: Row-Level Primitives
  // =========================================================================

  private async _ensureNode(nodeUuid: string): Promise<void> {
    await this.db.execute("INSERT OR IGNORE INTO nodes (uuid) VALUES (?)", [nodeUuid]);
  }

  private async _ensureParentPath(parentPath: string, domain: string, namespace: string): Promise<string> {
    if (!parentPath) return ROOT_NODE_UUID;

    const resolved = await this._resolvePath(parentPath, domain, namespace);
    if (resolved) return resolved[2];

    const parts = parentPath.split("/");
    let currentUuid = ROOT_NODE_UUID;
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const resolved2 = await this._resolvePath(currentPath, domain, namespace);
      if (resolved2) {
        currentUuid = resolved2[2];
      } else {
        const newUuid = randomUUID();
        await this._ensureNode(newUuid);
        await this._insertMemory(newUuid, "");
        await this._createEdgeWithPaths(currentUuid, newUuid, part, domain, currentPath, 0, null, namespace);
        await this.search.refreshSearchDocumentsForNode(newUuid, namespace);
        currentUuid = newUuid;
      }
    }
    return currentUuid;
  }

  private async _insertMemory(nodeUuid: string, content: string, deprecated = false): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO memories (content, node_uuid, deprecated) VALUES (?, ?, ?)`,
      [content, nodeUuid, deprecated ? 1 : 0]
    );
    return result.lastInsertRowid;
  }

  private async _getOrCreateEdge(
    parentUuid: string,
    childUuid: string,
    name: string,
    priority = 0,
    disclosure: string | null = null
  ): Promise<[number, boolean]> {
    const row = await this.db.fetchone<[number]>(
      `SELECT id FROM edges WHERE parent_uuid = ? AND child_uuid = ?`,
      [parentUuid, childUuid]
    );
    if (row) return [row[0], false];

    const result = await this.db.execute(
      `INSERT INTO edges (parent_uuid, child_uuid, name, priority, disclosure) VALUES (?, ?, ?, ?, ?)`,
      [parentUuid, childUuid, name, priority, disclosure]
    );
    return [result.lastInsertRowid, true];
  }

  private async _resolvePath(
    path: string,
    domain = "code",
    namespace = ""
  ): Promise<[number, number, string] | null> {
    const row = await this.db.fetchone<[number, number, string]>(
      `SELECT p.rowid, p.edge_id, e.child_uuid FROM paths p
       JOIN edges e ON p.edge_id = e.id
       WHERE p.namespace = ? AND p.domain = ? AND p.path = ?`,
      [namespace, domain, path]
    );
    if (!row) return null;
    return [row[0], row[1], row[2]];
  }

  private async _countPathsForEdge(edgeId: number): Promise<number> {
    const row = await this.db.fetchone<[number]>("SELECT COUNT(*) FROM paths WHERE edge_id = ?", [edgeId]);
    return row?.[0] ?? 0;
  }

  private async _countIncomingPaths(nodeUuid: string, namespace = "", searchAllNamespaces = false): Promise<number> {
    let sql = `SELECT COUNT(*) FROM paths p JOIN edges e ON p.edge_id = e.id WHERE e.child_uuid = ?`;
    const params: unknown[] = [nodeUuid];
    if (!searchAllNamespaces) {
      sql += " AND p.namespace = ?";
      params.push(namespace);
    }
    const row = await this.db.fetchone<[number]>(sql, params);
    return row?.[0] ?? 0;
  }

  // =========================================================================
  // Layer 1: Table-Scoped Operations
  // =========================================================================

  private async _deprecateNodeMemories(nodeUuid: string, successorId: number | null = null): Promise<number[]> {
    let sql: string;
    let params: unknown[];
    if (successorId !== null) {
      sql = `SELECT id FROM memories WHERE node_uuid = ? AND deprecated = 0 AND id != ?`;
      params = [nodeUuid, successorId];
    } else {
      sql = `SELECT id FROM memories WHERE node_uuid = ? AND deprecated = 0`;
      params = [nodeUuid];
    }
    const rows = await this.db.fetchall<[number]>(sql, params);
    const ids = rows.map((r) => r[0]);
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      await this.db.execute(
        `UPDATE memories SET deprecated = 1, migrated_to = ? WHERE id IN (${placeholders})`,
        [successorId, ...ids]
      );
    }
    return ids;
  }

  private async _cascadeCreatePaths(
    nodeUuid: string,
    domain: string,
    basePath: string,
    namespace = "",
    _visited: Set<string> | null = null
  ): Promise<void> {
    const visited = _visited ?? new Set<string>();
    if (visited.has(nodeUuid)) return;
    visited.add(nodeUuid);
    try {
      const childEdges = await this.db.fetchall<[number, string, string]>(
        "SELECT id, child_uuid, name FROM edges WHERE parent_uuid = ?",
        [nodeUuid]
      );
      for (const [edgeId, childUuid, name] of childEdges) {
        const childPath = `${basePath}/${name}`;
        const existing = await this.db.fetchone<[number]>(
          `SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?`,
          [namespace, domain, childPath]
        );
        if (!existing) {
          await this.db.execute(
            `INSERT INTO paths (namespace, domain, path, edge_id) VALUES (?, ?, ?, ?)`,
            [namespace, domain, childPath, edgeId]
          );
        }
        await this._cascadeCreatePaths(childUuid, domain, childPath, namespace, visited);
      }
    } finally {
      visited.delete(nodeUuid);
    }
  }

  // =========================================================================
  // Layer 2: Cross-Table Cascades
  // =========================================================================

  private async _deleteSubtreePaths(
    domain: string,
    path: string,
    namespace = ""
  ): Promise<void> {
    const safe = escapeLikeLiteral(path);
    const rows = await this.db.fetchall<[number]>(
      `SELECT rowid FROM paths WHERE namespace = ? AND domain = ? AND (path = ? OR path LIKE ? ESCAPE '\\')`,
      [namespace, domain, path, `${safe}/%`]
    );
    for (const [rowid] of rows) {
      await this.db.execute("DELETE FROM paths WHERE rowid = ?", [rowid]);
    }
  }

  private async _cascadeDeleteEdge(edgeId: number): Promise<void> {
    const edgeRows = await this.db.fetchall<[string, string, string]>(
      "SELECT p.domain, p.path, p.namespace FROM paths p WHERE p.edge_id = ?",
      [edgeId]
    );
    for (const [dom, pathStr, ns] of edgeRows) {
      await this._deleteSubtreePaths(dom, pathStr, ns);
    }
    await this.db.execute("DELETE FROM edges WHERE id = ?", [edgeId]);
  }

  async cascadeDeleteNode(nodeUuid: string): Promise<Record<string, unknown[]> | null> {
    if (nodeUuid === ROOT_NODE_UUID) return null;

    const edgeRows = await this.db.fetchall<[number]>(
      "SELECT id FROM edges WHERE parent_uuid = ? OR child_uuid = ?",
      [nodeUuid, nodeUuid]
    );
    for (const [edgeId] of edgeRows) {
      await this._cascadeDeleteEdge(edgeId);
    }

    await this.db.execute("DELETE FROM memories WHERE node_uuid = ?", [nodeUuid]);
    await this.db.execute("DELETE FROM glossary_keywords WHERE node_uuid = ?", [nodeUuid]);
    await this.db.execute("DELETE FROM nodes WHERE uuid = ?", [nodeUuid]);

    return { deleted: [nodeUuid] };
  }

  private async _createEdgeWithPaths(
    parentUuid: string,
    childUuid: string,
    name: string,
    domain: string,
    path: string,
    priority = 0,
    disclosure: string | null = null,
    namespace = ""
  ): Promise<Record<string, unknown>> {
    const [edgeId] = await this._getOrCreateEdge(parentUuid, childUuid, name, priority, disclosure);
    const result = await this.db.execute(
      `INSERT INTO paths (namespace, domain, path, edge_id) VALUES (?, ?, ?, ?)`,
      [namespace, domain, path, edgeId]
    );
    const pathRowid = result.lastInsertRowid;
    await this._cascadeCreatePaths(childUuid, domain, path, namespace);
    return { edge_id: edgeId, path_rowid: pathRowid };
  }

  // =========================================================================
  // Layer 3: GC / Conditional Logic
  // =========================================================================

  private async _gcEdgeIfPathless(edgeId: number): Promise<Record<string, unknown> | null> {
    if ((await this._countPathsForEdge(edgeId)) > 0) return null;
    const edgeRow = await this.db.fetchone<
      [number, string, string, string, number, string | null, string]
    >("SELECT * FROM edges WHERE id = ?", [edgeId]);
    if (!edgeRow) return null;
    await this.db.execute("DELETE FROM edges WHERE id = ?", [edgeId]);
    return {
      id: edgeRow[0],
      parent_uuid: edgeRow[1],
      child_uuid: edgeRow[2],
      name: edgeRow[3],
      priority: edgeRow[4],
      disclosure: edgeRow[5],
    };
  }

  private async _gcNodeSoft(nodeUuid: string): Promise<void> {
    if ((await this._countIncomingPaths(nodeUuid, undefined, true)) > 0) return;

    const incoming = await this.db.fetchall<[number]>("SELECT id FROM edges WHERE child_uuid = ?", [nodeUuid]);
    for (const [edgeId] of incoming) {
      await this._gcEdgeIfPathless(edgeId);
    }

    const outgoing = await this.db.fetchall<[number]>("SELECT id FROM edges WHERE parent_uuid = ?", [nodeUuid]);
    for (const [edgeId] of outgoing) {
      await this._cascadeDeleteEdge(edgeId);
    }

    await this._deprecateNodeMemories(nodeUuid);
  }

  // =========================================================================
  // Public Write API
  // =========================================================================

  async createMemory(
    parentPath: string,
    content: string,
    priority: number,
    title: string,
    disclosure: string | null = null,
    domain = "code",
    namespace = ""
  ): Promise<Record<string, unknown>> {
    if (!title) {
      throw new Error(
        "title is required. You must provide a semantic, meaningful path name (e.g., 'auth_flow', 'error_handling')."
      );
    }

    const parentUuid = await this._ensureParentPath(parentPath, domain, namespace);
    const finalPath = parentPath ? `${parentPath}/${title}` : title;

    const existing = await this.db.fetchone<[number]>(
      `SELECT 1 FROM paths WHERE namespace = ? AND domain = ? AND path = ?`,
      [namespace, domain, finalPath]
    );
    if (existing) {
      throw new Error(`Path '${domain}://${finalPath}' already exists`);
    }

    const newUuid = randomUUID();
    await this._ensureNode(newUuid);
    const memoryId = await this._insertMemory(newUuid, content);

    await this._createEdgeWithPaths(parentUuid, newUuid, title, domain, finalPath, priority, disclosure, namespace);
    await this.search.refreshSearchDocumentsForNode(newUuid, namespace);

    return {
      id: memoryId,
      node_uuid: newUuid,
      domain,
      path: finalPath,
      uri: `${domain}://${finalPath}`,
      priority,
    };
  }

  async updateMemory(
    path: string,
    content: string,
    domain = "code",
    namespace = "",
    priority?: number,
    disclosure?: string | null
  ): Promise<Record<string, unknown>> {
    const mem = await this.getMemoryByPath(path, domain, namespace);
    if (!mem) throw new Error(`Path '${domain}://${path}' not found`);

    const nodeUuid = mem['node_uuid'] as string;
    const oldMemoryId = mem['id'] as number;

    // Deprecate old memory
    await this._deprecateNodeMemories(nodeUuid, oldMemoryId);

    // Insert new memory
    const newMemoryId = await this._insertMemory(nodeUuid, content);

    // Update edge metadata if provided
    if (priority !== undefined || disclosure !== undefined) {
      const edgeRow = await this.db.fetchone<[number]>(
        `SELECT e.id FROM edges e
         JOIN paths p ON p.edge_id = e.id
         WHERE p.namespace = ? AND p.domain = ? AND p.path = ?`,
        [namespace, domain, path]
      );
      if (edgeRow) {
        const updates: string[] = [];
        const params: unknown[] = [];
        if (priority !== undefined) {
          updates.push("priority = ?");
          params.push(priority);
        }
        if (disclosure !== undefined) {
          updates.push("disclosure = ?");
          params.push(disclosure);
        }
        params.push(edgeRow[0]);
        await this.db.execute(`UPDATE edges SET ${updates.join(", ")} WHERE id = ?`, params);
      }
    }

    await this.search.refreshSearchDocumentsForNode(nodeUuid, namespace);

    return {
      id: newMemoryId,
      node_uuid: nodeUuid,
      domain,
      path,
      uri: `${domain}://${path}`,
    };
  }

  async removePath(path: string, domain = "code", namespace = ""): Promise<void> {
    const resolved = await this._resolvePath(path, domain, namespace);
    if (!resolved) return;
    await this._deleteSubtreePaths(domain, path, namespace);
    await this._gcEdgeIfPathless(resolved[1]);
    const mem = await this.getMemoryByPath(path, domain, namespace);
    if (mem) {
      await this._gcNodeSoft(mem['node_uuid'] as string);
    }
  }

  async deleteMemory(memoryId: number): Promise<Record<string, unknown>> {
    const row = await this.db.fetchone<
      [number, string, string, number, number | null, string]
    >("SELECT * FROM memories WHERE id = ?", [memoryId]);
    if (!row) throw new Error(`Memory ID ${memoryId} not found`);

    const [, nodeUuid, , _deprecated, migratedTo] = row;
    await this.db.execute("UPDATE memories SET migrated_to = ? WHERE migrated_to = ?", [migratedTo, memoryId]);
    await this.db.execute("DELETE FROM memories WHERE id = ?", [memoryId]);

    return { deleted_memory_id: memoryId, node_uuid: nodeUuid };
  }

  // =====================================================================
  // Code-Memory Link API
  // =====================================================================

  async linkCodeNodes(memoryNodeUuid: string, codeNodeUuids: string[], namespace = ""): Promise<Record<string, unknown>> {
    const added: string[] = [];
    const skipped: string[] = [];
    for (const codeUuid of codeNodeUuids) {
      const nodeRow = await this.db.fetchone<[number]>("SELECT 1 FROM nodes WHERE uuid = ?", [codeUuid]);
      if (!nodeRow) {
        skipped.push(`Node '${codeUuid}' does not exist`);
        continue;
      }
      const memRow = await this.db.fetchone<[number]>("SELECT 1 FROM nodes WHERE uuid = ?", [memoryNodeUuid]);
      if (!memRow) throw new Error(`Memory node '${memoryNodeUuid}' does not exist`);

      try {
        await this.db.execute(
          `INSERT INTO code_links (memory_node_uuid, code_node_uuid, namespace) VALUES (?, ?, ?)`,
          [memoryNodeUuid, codeUuid, namespace]
        );
        added.push(codeUuid);
      } catch {
        skipped.push(`Already linked: ${codeUuid}`);
      }
    }
    return { added, skipped };
  }

  async unlinkCodeNodes(memoryNodeUuid: string, codeNodeUuids: string[], namespace = ""): Promise<Record<string, unknown>> {
    for (const codeUuid of codeNodeUuids) {
      await this.db.execute(
        `DELETE FROM code_links WHERE memory_node_uuid = ? AND code_node_uuid = ? AND namespace = ?`,
        [memoryNodeUuid, codeUuid, namespace]
      );
    }
    return { removed: codeNodeUuids };
  }

  async getLinkedCodeNodes(memoryNodeUuid: string, namespace = ""): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<[string]>(
      `SELECT code_node_uuid FROM code_links WHERE memory_node_uuid = ? AND namespace = ?`,
      [memoryNodeUuid, namespace]
    );
    const result: Array<Record<string, unknown>> = [];
    for (const [codeUuid] of rows) {
      const mem = await this.getMemoryByNodeUuid(codeUuid, namespace);
      if (mem && (mem['paths'] as string[]).length > 0) {
        result.push({ node_uuid: codeUuid, uri: (mem['paths'] as string[])[0] });
      }
    }
    return result;
  }

  async getLinkedMemoryNodes(codeNodeUuid: string, namespace = ""): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<[string]>(
      `SELECT memory_node_uuid FROM code_links WHERE code_node_uuid = ? AND namespace = ?`,
      [codeNodeUuid, namespace]
    );
    const result: Array<Record<string, unknown>> = [];
    for (const [memoryUuid] of rows) {
      const mem = await this.getMemoryByNodeUuid(memoryUuid, namespace);
      if (mem && (mem['paths'] as string[]).length > 0) {
        result.push({ node_uuid: memoryUuid, uri: (mem['paths'] as string[])[0] });
      }
    }
    return result;
  }

  // =====================================================================
  // Brain: Activation & Episodes
  // =====================================================================

  async activateNode(
    nodeUuid: string,
    triggerContext: string,
    strength = 1.0,
    recordEpisode = true
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute(
      `INSERT INTO node_activation (node_uuid, baseline_activation, current_activation, total_activation_count, last_activated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(node_uuid) DO UPDATE SET
         current_activation = current_activation + excluded.current_activation,
         total_activation_count = total_activation_count + 1,
         last_activated_at = excluded.last_activated_at`,
      [nodeUuid, strength * 0.1, strength, now]
    );

    if (recordEpisode) {
      await this.db.execute(
        `INSERT INTO memory_episodes (node_uuid, episode_type, trigger_uri, activation_strength, created_at)
         VALUES (?, 'activation', ?, ?, ?)`,
        [nodeUuid, triggerContext, strength, now]
      );
    }
  }

  async decayActivations(decayFactor = 0.95): Promise<{ active_nodes: number }> {
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE node_activation SET current_activation = current_activation * ?, last_decayed_at = ?`,
      [decayFactor, now]
    );
    const row = await this.db.fetchone<[number]>(
      `SELECT COUNT(*) FROM node_activation WHERE current_activation > 0.01`
    );
    return { active_nodes: row?.[0] ?? 0 };
  }

  async recordEpisode(
    nodeUuid: string,
    episodeType: string,
    triggerUri: string | null,
    triggerText: string | null,
    workingMemorySnapshot: string[],
    activationStrength = 1.0
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO memory_episodes (node_uuid, episode_type, trigger_uri, trigger_text, working_memory_snapshot, activation_strength, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeUuid,
        episodeType,
        triggerUri,
        triggerText,
        JSON.stringify(workingMemorySnapshot),
        activationStrength,
        new Date().toISOString(),
      ]
    );
  }

  async getRecentEpisodes(limit = 50): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<
      [number, string, string, string | null, string | null, string | null, number, string]
    >(
      `SELECT id, node_uuid, episode_type, trigger_uri, trigger_text, working_memory_snapshot, activation_strength, created_at
       FROM memory_episodes ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map(([id, nodeUuid, type, uri, text, snapshot, strength, createdAt]) => ({
      id,
      node_uuid: nodeUuid,
      episode_type: type,
      trigger_uri: uri,
      trigger_text: text,
      working_memory_snapshot: snapshot ? (JSON.parse(snapshot) as unknown[]) : [],
      activation_strength: strength,
      created_at: createdAt,
    }));
  }

  async reinforceEdgesByCoactivation(
    nodeUuids: string[],
    delta = 0.03
  ): Promise<{ reinforced: number; created: number }> {
    let reinforced = 0;
    let created = 0;
    for (let i = 0; i < nodeUuids.length; i++) {
      for (let j = i + 1; j < nodeUuids.length; j++) {
        const a = nodeUuids[i];
        const b = nodeUuids[j];
        const row = await this.db.fetchone<[number, number]>(
          `SELECT id, weight FROM associative_edges WHERE source_uuid = ? AND target_uuid = ? AND edge_type = 'associates'`,
          [a, b]
        );
        if (row) {
          const newWeight = Math.min(1.0, row[1] + delta);
          await this.db.execute(`UPDATE associative_edges SET weight = ?, activation_count = activation_count + 1, last_activated_at = ? WHERE id = ?`, [
            newWeight,
            new Date().toISOString(),
            row[0],
          ]);
          reinforced++;
        } else {
          await this.db.execute(
            `INSERT INTO associative_edges (source_uuid, target_uuid, edge_type, weight, last_activated_at) VALUES (?, ?, 'associates', ?, ?)`,
            [a, b, Math.max(0.5, delta), new Date().toISOString()]
          );
          created++;
        }
      }
    }
    return { reinforced, created };
  }

  async getNeighbors(
    nodeUuid: string,
    minWeight = 0.15,
    _namespace = ""
  ): Promise<Array<{ node_uuid: string; weight: number; edge_type: string }>> {
    const rows = await this.db.fetchall<[string, number, string]>(
      `SELECT target_uuid, weight, edge_type FROM associative_edges
       WHERE source_uuid = ? AND weight >= ?
       UNION
       SELECT source_uuid, weight, edge_type FROM associative_edges
       WHERE target_uuid = ? AND weight >= ?`,
      [nodeUuid, minWeight, nodeUuid, minWeight]
    );
    return rows.map(([uid, weight, type]) => ({ node_uuid: uid, weight, edge_type: type }));
  }

  async deletePath(path: string, domain = "code", namespace = ""): Promise<{ deleted_uri: string; node_uuid: string | null }> {
    const mem = await this.getMemoryByPath(path, domain, namespace);
    const nodeUuid = mem ? (mem['node_uuid'] as string) : null;
    await this.removePath(path, domain, namespace);
    if (nodeUuid) {
      await this.search.refreshSearchDocumentsForNode(nodeUuid, namespace);
    }
    return { deleted_uri: `${domain}://${path}`, node_uuid: nodeUuid };
  }

  // =====================================================================
  // Boot Links Management
  // =====================================================================

  async addBootLink(uri: string, namespace = ""): Promise<{ id: number; target_uri: string }> {
    const targetUri = uri.trim();
    if (!targetUri) throw new Error("URI cannot be empty");
    
    await this.db.execute(
      "INSERT OR IGNORE INTO boot_links (target_uri) VALUES (?)",
      [targetUri]
    );
    
    const row = await this.db.fetchone<[number, string]>(
      "SELECT id, target_uri FROM boot_links WHERE target_uri = ?",
      [targetUri]
    );
    
    if (!row) throw new Error(`Failed to add boot link: ${targetUri}`);
    return { id: row[0], target_uri: row[1] };
  }

  async removeBootLink(uri: string, namespace = ""): Promise<{ removed_uri: string }> {
    const targetUri = uri.trim();
    await this.db.execute("DELETE FROM boot_links WHERE target_uri = ?", [targetUri]);
    return { removed_uri: targetUri };
  }

  async getBootLinks(namespace = ""): Promise<Array<{ id: number; target_uri: string; created_at: string | null }>> {
    const rows = await this.db.fetchall<[number, string, string | null]>(
      "SELECT id, target_uri, created_at FROM boot_links ORDER BY created_at DESC"
    );
    return rows.map(([id, target_uri, created_at]) => ({ id, target_uri, created_at }));
  }

  async resolveBootLinks(namespace = ""): Promise<{
    content: string;
    missingLinks: string[];
    links: Array<{ uri: string; content: string; found: boolean }>;
  }> {
    const links = await this.getBootLinks(namespace);
    const missingLinks: string[] = [];
    const resolvedLinks: Array<{ uri: string; content: string; found: boolean }> = [];
    const contentParts: string[] = [];

    for (const link of links) {
      const [domain, path] = this._parseUri(link.target_uri);
      const memory = await this.getMemoryByPath(path, domain, namespace);
      
      if (memory && memory['content']) {
        contentParts.push(`\n${'='.repeat(60)}\n[BOOT LINK] ${link.target_uri}\n${'='.repeat(60)}\n\n${memory['content'] as string}\n`);
        resolvedLinks.push({ uri: link.target_uri, content: memory['content'] as string, found: true });
      } else {
        missingLinks.push(link.target_uri);
        resolvedLinks.push({ uri: link.target_uri, content: "", found: false });
      }
    }

    return {
      content: contentParts.join("\n"),
      missingLinks,
      links: resolvedLinks,
    };
  }

  private _parseUri(uri: string): [string, string] {
    const m = uri.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*):\/\/(.*)$/);
    if (m) {
      return [m[1]!.toLowerCase(), m[2]!.trim().replace(/^\/+/, "")];
    }
    return ["code", uri.trim().replace(/^\/+/, "")];
  }

  async getMemoryIdByPath(path: string, domain = "code", namespace = ""): Promise<number | null> {
    const mem = await this.getMemoryByPath(path, domain, namespace);
    return mem ? (mem['id'] as number) : null;
  }

  async getActivationState(nodeUuid: string): Promise<Record<string, unknown> | null> {
    const row = await this.db.fetchone<
      [number, number, number, string | null]
    >(
      `SELECT baseline_activation, current_activation, total_activation_count, last_activated_at
       FROM node_activation WHERE node_uuid = ?`,
      [nodeUuid]
    );
    if (!row) return null;
    return {
      node_uuid: nodeUuid,
      baseline_activation: row[0],
      current_activation: row[1],
      total_activation_count: row[2],
      last_activated_at: row[3],
    };
  }

  // =====================================================================
  // Concept Evidence
  // =====================================================================

  async getConceptsByEvidence(evidenceNodeUuid: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<[string, number]>(
      `SELECT concept_node_uuid, strength FROM concept_evidence WHERE evidence_node_uuid = ?`,
      [evidenceNodeUuid]
    );
    return rows.map(([conceptUuid, strength]) => ({ concept_uuid: conceptUuid, strength }));
  }

  async addConceptEvidence(
    conceptNodeUuid: string,
    evidenceNodeUuid: string,
    evidenceType = "signature_match",
    strength = 1.0
  ): Promise<void> {
    await this.db.execute(
      `INSERT OR IGNORE INTO concept_evidence (concept_node_uuid, evidence_node_uuid, evidence_type, strength, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [conceptNodeUuid, evidenceNodeUuid, evidenceType, strength, new Date().toISOString(), new Date().toISOString()]
    );
  }

  async verifyConceptEvidence(conceptNodeUuid: string): Promise<void> {
    const evidenceRows = await this.db.fetchall<[string, string]>(
      `SELECT evidence_node_uuid, evidence_type FROM concept_evidence WHERE concept_node_uuid = ?`,
      [conceptNodeUuid]
    );
    for (const [evNodeUuid, evType] of evidenceRows) {
      const mem = await this.getMemoryByNodeUuid(evNodeUuid);
      const stillValid = mem !== null && !(mem['deprecated'] as boolean);
      await this.db.execute(
        `UPDATE concept_evidence SET strength = ?, verified_at = ? WHERE concept_node_uuid = ? AND evidence_node_uuid = ? AND evidence_type = ?`,
        [stillValid ? 1.0 : 0.1, new Date().toISOString(), conceptNodeUuid, evNodeUuid, evType]
      );
    }
  }

  async getConceptEvidence(conceptNodeUuid: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<[string, string, number, string | null]>(
      `SELECT evidence_node_uuid, evidence_type, strength, verified_at FROM concept_evidence WHERE concept_node_uuid = ?`,
      [conceptNodeUuid]
    );
    return rows.map(([evNode, evType, strength, verifiedAt]) => ({
      evidence_node_uuid: evNode,
      evidence_type: evType,
      strength,
      verified_at: verifiedAt,
    }));
  }

  // =====================================================================
  // Utilities
  // =====================================================================

  async getRecentMemories(limit = 10, namespace = ""): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.fetchall<
      [string, string, string, number, string | null, string]
    >(
      `SELECT p.domain, p.path, m.content, e.priority, e.disclosure, m.created_at
       FROM memories m
       JOIN edges e ON e.child_uuid = m.node_uuid
       JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
       WHERE m.deprecated = 0
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [namespace, limit]
    );
    return rows.map(([domain, pathStr, content, priority, disclosure, createdAt]) => ({
      uri: `${domain}://${pathStr}`,
      domain,
      path: pathStr,
      content,
      priority,
      disclosure,
      created_at: createdAt,
    }));
  }

  async propagateActivation(
    nodeUuid: string,
    depth = 1,
    decay = 0.5,
    minWeight = 0.2
  ): Promise<Array<{ node_uuid: string; effective_weight: number }>> {
    const results: Array<{ node_uuid: string; effective_weight: number }> = [];
    const visited = new Set<string>([nodeUuid]);
    let currentLayer = [{ node_uuid: nodeUuid, weight: 1.0 }];

    for (let d = 0; d < depth && currentLayer.length > 0; d++) {
      const nextLayer: Array<{ node_uuid: string; weight: number }> = [];
      for (const curr of currentLayer) {
        const neighbors = await this.getNeighbors(curr.node_uuid, minWeight);
        for (const n of neighbors) {
          if (visited.has(n.node_uuid)) continue;
          visited.add(n.node_uuid);
          const effectiveWeight = curr.weight * n.weight * decay;
          if (effectiveWeight >= 0.05) {
            results.push({ node_uuid: n.node_uuid, effective_weight: effectiveWeight });
            nextLayer.push({ node_uuid: n.node_uuid, weight: effectiveWeight });
          }
        }
      }
      currentLayer = nextLayer;
    }

    return results.sort((a, b) => b.effective_weight - a.effective_weight);
  }
}
