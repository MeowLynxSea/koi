/**
 * CCE Web Server — Lightweight Bun HTTP server for the CCE dashboard.
 *
 * Serves the React SPA (built from frontend/) and provides REST API
 * compatible with the Cat's Context Engine frontend.
 */

import { getNamespaceContext } from "../agent-bridge/namespace-context.js";
import { getDbManager } from "../core/db.js";
import { initDb } from "../core/init.js";
import { GraphService } from "../graph/graph-service.js";
import { SearchIndexer } from "../graph/search-indexer.js";
import { EmbeddingService } from "../graph/embedding-service.js";
import { GlossaryService } from "../graph/glossary-service.js";
import { WorkingMemoryManager, getWorkingMemoryManager } from "../brain/working-memory.js";
import { ROOT_NODE_UUID } from "../core/types.js";
import path from "path";
import fs from "fs";

function resolveDistDir(): string {
  const candidates = [
    path.resolve(import.meta.dir, "frontend", "dist"),
    path.resolve(process.cwd(), "src", "cce", "web", "frontend", "dist"),
    path.resolve(process.cwd(), "dist", "cce-frontend"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "CCE frontend dist not found. Please build it first:\n  cd src/cce/web/frontend && bun install && bun run build"
  );
}

const DIST_DIR = resolveDistDir();

export function createCceWebServer(port: number) {
  const sseClients = new Set<(data: string) => void>();

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // SSE endpoints
      if (pathname === "/api/events" || pathname === "/api/brain/stream") {
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode("event: connected\ndata: {\"status\":\"connected\"}\n\n"));
              const send = (data: string) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                  // client disconnected
                }
              };
              sseClients.add(send);
            },
          }),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } }
        );
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        return await handleApi(req, pathname);
      }

      // Static files — SPA fallback
      const staticPath = pathname === "/" ? "/index.html" : pathname;
      const filePath = path.join(DIST_DIR, staticPath);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      // SPA fallback for unknown paths (excluding api)
      const indexHtml = Bun.file(path.join(DIST_DIR, "index.html"));
      if (await indexHtml.exists()) {
        return new Response(indexHtml, { headers: { "Content-Type": "text/html" } });
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}

async function handleApi(req: Request, pathname: string): Promise<Response> {
  const ns = getNamespaceContext().current;
  const db = getDbManager(ns);
  await initDb(db);

  const embedding = new EmbeddingService();
  const search = new SearchIndexer(db, embedding);
  const glossary = new GlossaryService(db, search);
  const graph = new GraphService(db, search);
  const wm = getWorkingMemoryManager() || new WorkingMemoryManager(graph);

  try {
    // ------------------------------------------------------------------
    // Legacy / existing routes
    // ------------------------------------------------------------------
    if (pathname === "/api/contexts" && req.method === "GET") {
      const domain = new URL(req.url).searchParams.get("domain");
      const paths = await graph.getAllPaths(domain, ns);
      return Response.json({ namespace: ns, contexts: paths });
    }

    if (pathname === "/api/contexts/search" && req.method === "GET") {
      const query = new URL(req.url).searchParams.get("q") || "";
      const limit = parseInt(new URL(req.url).searchParams.get("limit") || "10", 10);
      const results = await search.search(query, limit, null, ns);
      return Response.json({ query, results });
    }

    if (pathname === "/api/contexts/browse" && req.method === "GET") {
      const uri = new URL(req.url).searchParams.get("uri") || "";
      let nodeUuid = ROOT_NODE_UUID;
      let domain: string | undefined;
      let cpath: string | undefined;
      if (uri) {
        const m = uri.match(/^([a-z]+):\/\/(.*)$/);
        if (m) {
          domain = m[1];
          cpath = m[2];
          const mem = await graph.getMemoryByPath(cpath!, domain!, ns);
          if (mem) nodeUuid = mem['node_uuid'] as string;
        }
      }
      const children = await graph.getChildren(nodeUuid, domain || null, cpath || null, ns);
      return Response.json({ uri, children });
    }

    if (pathname === "/api/contexts/read" && req.method === "GET") {
      const uri = new URL(req.url).searchParams.get("uri") || "";
      const m = uri.match(/^([a-z]+):\/\/(.*)$/);
      if (!m) return Response.json({ error: "Invalid URI" }, { status: 400 });
      const mem = await graph.getMemoryByPath(m[2]!, m[1]!, ns);
      return Response.json({ uri, memory: mem });
    }

    if (pathname === "/api/brain/working-memory" && req.method === "GET") {
      return Response.json(wm.getPoolDict(ns));
    }

    if (pathname === "/api/brain/activations" && req.method === "GET") {
      const query = new URL(req.url).searchParams.get("q") || "";
      const { ActivationEngine } = await import("../brain/activation-engine.js");
      const activation = new ActivationEngine(db, search, glossary, graph);
      const results = await activation.computeActivations(query, ns, 20);
      return Response.json({ query, activations: results });
    }

    if (pathname === "/api/maintenance/stats" && req.method === "GET") {
      const counts = await db.fetchall<[string, number]>(
        `SELECT 'nodes' as t, COUNT(*) FROM nodes
         UNION ALL SELECT 'memories', COUNT(*) FROM memories WHERE deprecated = 0
         UNION ALL SELECT 'edges', COUNT(*) FROM edges
         UNION ALL SELECT 'paths', COUNT(*) FROM paths WHERE namespace = ?
         UNION ALL SELECT 'associative_edges', COUNT(*) FROM associative_edges
         UNION ALL SELECT 'episodes', COUNT(*) FROM memory_episodes`,
        [ns]
      );
      const stats: Record<string, number> = {};
      for (const [t, c] of counts) stats[t] = c;
      return Response.json({ namespace: ns, stats });
    }

    if (pathname === "/api/namespace" && req.method === "GET") {
      return Response.json({ namespace: ns, cwd: process.cwd() });
    }

    // ------------------------------------------------------------------
    // Browse API
    // ------------------------------------------------------------------
    if (pathname === "/api/browse/domains" && req.method === "GET") {
      const rows = await db.fetchall<[string, number]>(
        `SELECT domain, COUNT(DISTINCT path) as root_count
         FROM paths WHERE namespace = ? AND path NOT LIKE '%/%'
         GROUP BY domain ORDER BY domain`,
        [ns]
      );
      return Response.json(rows.map(([domain, root_count]) => ({ domain, root_count })));
    }

    if (pathname === "/api/browse/namespaces" && req.method === "GET") {
      const rows = await db.fetchall<[string]>(
        `SELECT DISTINCT namespace FROM paths ORDER BY namespace`
      );
      return Response.json(rows.map(r => r[0]));
    }

    if (pathname === "/api/browse/node" && req.method === "GET") {
      const urlObj = new URL(req.url);
      const domain = urlObj.searchParams.get("domain") || "code";
      const pathParam = urlObj.searchParams.get("path") || "";
      const navOnly = urlObj.searchParams.get("nav_only") === "true";

      let memory: Record<string, unknown> | null;
      let childrenRaw: Array<Record<string, unknown>>;
      let breadcrumbs: Array<{ path: string; label: string }>;

      if (!pathParam) {
        memory = await graph.getMemoryByPath("", domain, ns);
        childrenRaw = await graph.getChildren(ROOT_NODE_UUID, domain, "", ns);
        if (memory && memory['node_uuid'] === ROOT_NODE_UUID) {
          childrenRaw = childrenRaw.filter(c => c['node_uuid'] !== ROOT_NODE_UUID);
        }
        if (!memory) {
          memory = {
            content: "", priority: 0, disclosure: null,
            created_at: null, node_uuid: ROOT_NODE_UUID, is_virtual: true,
          };
        }
        breadcrumbs = [{ path: "", label: "root" }];
      } else {
        memory = await graph.getMemoryByPath(pathParam, domain, ns);
        if (!memory) return Response.json({ detail: `Path not found: ${domain}://${pathParam}` }, { status: 404 });
        childrenRaw = await graph.getChildren(memory['node_uuid'] as string, domain, pathParam, ns);
        const segments = pathParam.split("/");
        breadcrumbs = [{ path: "", label: "root" }];
        let accumulated = "";
        for (const seg of segments) {
          accumulated = accumulated ? `${accumulated}/${seg}` : seg;
          breadcrumbs.push({ path: accumulated, label: seg });
        }
      }

      const children = childrenRaw
        .filter(c => c['domain'] === domain)
        .map(c => ({
          domain: String(c['domain']), path: String(c['path']),
          uri: `${String(c['domain'])}://${String(c['path'])}`,
          name: (c['path'] as string).split("/").pop(),
          priority: Number(c['priority']), disclosure: c['disclosure'] as string | null,
          content_snippet: String(c['content_snippet']),
          approx_children_count: Number(c['approx_children_count']) ?? 0,
        }))
        .sort((a, b) => (((a.priority as number) ?? 999) - ((b.priority as number) ?? 999)) || (a.path as string).localeCompare(b.path as string));

      // aliases
      let aliases: string[] = [];
      const nodeUuid = memory?.['node_uuid'] as string;
      if (nodeUuid && nodeUuid !== ROOT_NODE_UUID) {
        const aliasRows = await db.fetchall<[string, string]>(
          `SELECT p.domain, p.path FROM paths p
           JOIN edges e ON p.edge_id = e.id
           WHERE p.namespace = ? AND e.child_uuid = ?`,
          [ns, nodeUuid]
        );
        aliases = aliasRows
          .map(([d, p]) => `${d}://${p}`)
          .filter(a => a !== `${domain}://${pathParam}`);
      }

      // glossary
      let glossary_keywords: string[] = [];
      let glossary_matches: Array<{ keyword: string; nodes: Array<{ node_uuid: string; uri: string }> }> = [];
      let linked_code_nodes: Array<Record<string, unknown>> = [];
      let linked_memory_nodes: Array<Record<string, unknown>> = [];

      if (!navOnly && nodeUuid && nodeUuid !== ROOT_NODE_UUID) {
        glossary_keywords = await glossary.getGlossaryForNode(nodeUuid, ns);
        if (memory?.['content']) {
          const matchesDict = await glossary.findGlossaryInContent(memory['content'] as string, ns);
          if (matchesDict) {
            glossary_matches = Array.from(matchesDict.entries()).map(([keyword, nodes]) => ({ keyword, nodes }));
          }
        }
        if (domain !== "code") {
          linked_code_nodes = await graph.getLinkedCodeNodes(nodeUuid, ns);
        } else {
          linked_memory_nodes = await graph.getLinkedMemoryNodes(nodeUuid, ns);
        }
      }

      return Response.json({
        node: {
          path: pathParam,
          domain,
          uri: `${domain}://${pathParam}`,
          name: pathParam ? pathParam.split("/").pop() : "root",
          content: memory?.['content'] ?? "",
          priority: memory?.['priority'] ?? 0,
          disclosure: memory?.['disclosure'] ?? null,
          created_at: memory?.['created_at'] ?? null,
          is_virtual: memory?.['node_uuid'] === ROOT_NODE_UUID,
          aliases,
          node_uuid: nodeUuid,
          glossary_keywords,
          glossary_matches,
          linked_code_nodes,
          linked_memory_nodes,
        },
        children,
        breadcrumbs,
      });
    }

    if (pathname === "/api/browse/node" && req.method === "PUT") {
      const urlObj = new URL(req.url);
      const domain = urlObj.searchParams.get("domain") || "code";
      const pathParam = urlObj.searchParams.get("path") || "";
      const body = await req.json() as { content?: string; priority?: number; disclosure?: string | null };
      const mem = await graph.getMemoryByPath(pathParam, domain, ns);
      if (!mem) return Response.json({ detail: `Path not found: ${domain}://${pathParam}` }, { status: 404 });

      const result = await graph.updateMemory(
        pathParam,
        body.content ?? (mem['content'] as string),
        domain,
        ns,
        body.priority,
        body.disclosure,
      );
      return Response.json({ success: true, context_id: String(result['id']) });
    }

    if (pathname === "/api/browse/glossary" && req.method === "GET") {
      const entries = await glossary.getAllGlossary(ns, false);
      return Response.json({ glossary: entries });
    }

    if (pathname === "/api/browse/glossary" && req.method === "POST") {
      const body = await req.json() as { keyword: string; node_uuid: string };
      const result = await glossary.addGlossaryKeyword(body.keyword, body.node_uuid, ns);
      return Response.json({ success: true, ...result });
    }

    if (pathname === "/api/browse/glossary" && req.method === "DELETE") {
      const body = await req.json() as { keyword: string; node_uuid: string };
      await glossary.removeGlossaryKeyword(body.keyword, body.node_uuid, ns);
      return Response.json({ success: true });
    }

    // ------------------------------------------------------------------
    // Namespace API
    // ------------------------------------------------------------------
    if (pathname === "/api/namespaces" && req.method === "GET") {
      const rows = await db.fetchall<[string, number, number, number, number]>(
        `SELECT COALESCE(p.namespace, '') AS namespace,
                COUNT(DISTINCT p.rowid) AS path_count,
                COUNT(DISTINCT e.child_uuid) AS node_count,
                COUNT(DISTINCT p.domain) AS domain_count,
                COUNT(DISTINCT m.id) AS memory_count
         FROM paths p
         JOIN edges e ON p.edge_id = e.id
         JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
         GROUP BY p.namespace ORDER BY p.namespace`
      );

      const domainRows = await db.fetchall<[string, string, number, number, number]>(
        `SELECT COALESCE(p.namespace, '') AS ns, p.domain,
                COUNT(DISTINCT p.rowid) AS path_count,
                COUNT(DISTINCT e.child_uuid) AS node_count,
                COUNT(DISTINCT m.id) AS memory_count
         FROM paths p
         JOIN edges e ON p.edge_id = e.id
         JOIN memories m ON m.node_uuid = e.child_uuid AND m.deprecated = 0
         WHERE p.domain IN ('code', 'concept', 'memory')
         GROUP BY p.namespace, p.domain`
      );
      const domainStats: Record<string, Record<string, { paths: number; nodes: number; memories: number }>> = {};
      for (const [nss, dom, pc, nc, mc] of domainRows) {
        if (!domainStats[nss]) domainStats[nss] = {};
        domainStats[nss]![dom] = { paths: pc, nodes: nc, memories: mc };
      }

      const glossaryRows = await db.fetchall<[string, number]>(
        `SELECT COALESCE(namespace, '') AS ns, COUNT(*) AS cnt FROM glossary_keywords GROUP BY namespace`
      );
      const glossaryCounts: Record<string, number> = {};
      for (const [n, c] of glossaryRows) glossaryCounts[n] = c;

      const linkRows = await db.fetchall<[string, number]>(
        `SELECT COALESCE(namespace, '') AS ns, COUNT(*) AS cnt FROM code_links GROUP BY namespace`
      );
      const linkCounts: Record<string, number> = {};
      for (const [n, c] of linkRows) linkCounts[n] = c;

      const defDomain = { paths: 0, nodes: 0, memories: 0 };
      const namespaces = rows.map(([name, pc, nc, dc, mc]) => ({
        name,
        path_count: pc,
        node_count: nc,
        domain_count: dc,
        memory_count: mc,
        glossary_count: glossaryCounts[name] ?? 0,
        code_link_count: linkCounts[name] ?? 0,
        code: domainStats[name]?.['code'] ?? defDomain,
        concept: domainStats[name]?.['concept'] ?? defDomain,
        memory: domainStats[name]?.['memory'] ?? defDomain,
        initializing: false,
      }));

      return Response.json(namespaces);
    }

    if (pathname === "/api/namespaces" && req.method === "DELETE") {
      const name = new URL(req.url).searchParams.get("name");
      if (!name) return Response.json({ detail: "Missing name" }, { status: 400 });
      await db.execute("DELETE FROM paths WHERE namespace = ?", [name]);
      await db.execute("DELETE FROM glossary_keywords WHERE namespace = ?", [name]);
      await db.execute("DELETE FROM code_links WHERE namespace = ?", [name]);
      await db.execute("DELETE FROM context_vectors WHERE namespace = ?", [name]);

      const edgeRows = await db.fetchall<[number]>(
        `SELECT e.id FROM edges e LEFT JOIN paths p ON p.edge_id = e.id WHERE p.rowid IS NULL`
      );
      const orphanedEdgeIds = edgeRows.map(r => r[0]);
      let removedNodes = 0;
      let removedMemories = 0;

      if (orphanedEdgeIds.length > 0) {
        const placeholders = orphanedEdgeIds.map(() => "?").join(",");
        const nodeRows = await db.fetchall<[string]>(
          `SELECT DISTINCT child_uuid FROM edges WHERE id IN (${placeholders})`, orphanedEdgeIds
        );
        const orphanedNodeUuids = new Set(nodeRows.map(r => r[0]));
        await db.execute(`DELETE FROM edges WHERE id IN (${placeholders})`, orphanedEdgeIds);

        for (const nodeUuid of orphanedNodeUuids) {
          if (nodeUuid === ROOT_NODE_UUID) continue;
          const ec = await db.fetchone<[number]>(
            `SELECT COUNT(*) FROM edges WHERE parent_uuid = ? OR child_uuid = ?`, [nodeUuid, nodeUuid]
          );
          if (ec && ec[0] === 0) {
            const memRows = await db.fetchall<[number]>(`SELECT id FROM memories WHERE node_uuid = ?`, [nodeUuid]);
            removedMemories += memRows.length;
            await db.execute(`DELETE FROM memories WHERE node_uuid = ?`, [nodeUuid]);
            await db.execute(`DELETE FROM nodes WHERE uuid = ?`, [nodeUuid]);
            removedNodes++;
          }
        }
      }
      return Response.json({ success: true, namespace: name, removed_edges: orphanedEdgeIds.length, removed_nodes: removedNodes, removed_memories: removedMemories });
    }

    if (pathname === "/api/namespaces" && req.method === "PUT") {
      const name = new URL(req.url).searchParams.get("name");
      const body = await req.json() as { new_name?: string };
      const newName = body.new_name?.trim();
      if (!name || !newName) return Response.json({ detail: "Missing name or new_name" }, { status: 400 });
      if (newName === name) return Response.json({ detail: "New name is the same as old" }, { status: 400 });
      const existing = await db.fetchone<[number]>(`SELECT 1 FROM paths WHERE namespace = ? LIMIT 1`, [newName]);
      if (existing) return Response.json({ detail: `Namespace '${newName}' already exists` }, { status: 409 });

      await db.execute("UPDATE paths SET namespace = ? WHERE namespace = ?", [newName, name]);
      await db.execute("UPDATE glossary_keywords SET namespace = ? WHERE namespace = ?", [newName, name]);
      await db.execute("UPDATE code_links SET namespace = ? WHERE namespace = ?", [newName, name]);
      await db.execute("UPDATE context_vectors SET namespace = ? WHERE namespace = ?", [newName, name]);
      return Response.json({ success: true, old_name: name, new_name: newName });
    }

    // ------------------------------------------------------------------
    // Brain API
    // ------------------------------------------------------------------
    if (pathname === "/api/brain/top-activated" && req.method === "GET") {
      const limit = parseInt(new URL(req.url).searchParams.get("limit") || "20", 10);
      const minActivation = parseFloat(new URL(req.url).searchParams.get("min_activation") || "0.01");
      const rows = await db.fetchall<[string, number, number, number, string | null]>(
        `SELECT na.node_uuid, na.baseline_activation, na.current_activation, na.total_activation_count, na.last_activated_at
         FROM node_activation na
         JOIN edges e ON e.child_uuid = na.node_uuid
         JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
         WHERE na.current_activation >= ?
         ORDER BY na.current_activation DESC LIMIT ?`,
        [ns, minActivation, limit]
      );
      const nodes = [];
      for (const [node_uuid, baseline, current, total, last] of rows) {
        const pathsData = await graph.getPathsForNode(node_uuid, ns);
        nodes.push({
          node_uuid,
          uri: pathsData[0]?.uri || null,
          baseline_activation: baseline,
          current_activation: current,
          total_activation_count: total,
          last_activated_at: last,
        });
      }
      return Response.json({ namespace: ns, nodes });
    }

    if (pathname.startsWith("/api/brain/neighbors/") && req.method === "GET") {
      const nodeUuid = decodeURIComponent(pathname.slice("/api/brain/neighbors/".length));
      const urlObj = new URL(req.url);
      const minWeight = parseFloat(urlObj.searchParams.get("min_weight") || "0.1");
      const neighbors = await graph.getNeighbors(nodeUuid, minWeight, ns);
      const enriched = [];
      for (const n of neighbors) {
        const pathsData = await graph.getPathsForNode(n.node_uuid, ns);
        enriched.push({ ...n, uri: pathsData[0]?.uri || null });
      }
      return Response.json({ node_uuid: nodeUuid, neighbors: enriched });
    }

    if (pathname.startsWith("/api/brain/activation/") && req.method === "GET") {
      const nodeUuid = decodeURIComponent(pathname.slice("/api/brain/activation/".length));
      const state = await graph.getActivationState(nodeUuid);
      if (!state) return Response.json({ detail: "Activation state not found" }, { status: 404 });
      return Response.json(state);
    }

    if (pathname.startsWith("/api/brain/episodes/") && req.method === "GET") {
      const nodeUuid = decodeURIComponent(pathname.slice("/api/brain/episodes/".length));
      const limit = parseInt(new URL(req.url).searchParams.get("limit") || "20", 10);
      const rows = await db.fetchall<
        [number, string, string, string | null, string | null, string | null, number, string]
      >(
        `SELECT id, node_uuid, episode_type, trigger_uri, trigger_text, working_memory_snapshot, activation_strength, created_at
         FROM memory_episodes WHERE node_uuid = ? ORDER BY created_at DESC LIMIT ?`,
        [nodeUuid, limit]
      );
      const episodes = rows.map(([id, nu, type, uri, text, snapshot, strength, createdAt]) => ({
        id, node_uuid: nu, episode_type: type, trigger_uri: uri, trigger_text: text,
        working_memory_snapshot: snapshot ? (JSON.parse(snapshot) as unknown[]) : [],
        activation_strength: strength, created_at: createdAt,
      }));
      return Response.json({ node_uuid: nodeUuid, episodes });
    }

    if (pathname.startsWith("/api/brain/concept-evidence/") && req.method === "GET") {
      const nodeUuid = decodeURIComponent(pathname.slice("/api/brain/concept-evidence/".length));
      const evidence = await graph.getConceptEvidence(nodeUuid);
      return Response.json({ concept_uuid: nodeUuid, evidence });
    }

    if (pathname === "/api/brain/dream-log" && req.method === "GET") {
      const limit = parseInt(new URL(req.url).searchParams.get("limit") || "50", 10);
      const episodes = await graph.getRecentEpisodes(limit);
      return Response.json({ episodes });
    }

    if (pathname === "/api/brain/stats" && req.method === "GET") {
      const edgeCount = await db.fetchone<[number]>(`SELECT COUNT(*) FROM associative_edges`);
      const episodeCount = await db.fetchone<[number]>(`SELECT COUNT(*) FROM memory_episodes`);
      const activeNodeCount = await db.fetchone<[number]>(
        `SELECT COUNT(*) FROM node_activation na
         JOIN edges e ON e.child_uuid = na.node_uuid
         JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
         WHERE na.current_activation >= 0.1`, [ns]
      );
      const avgActivation = await db.fetchone<[number]>(
        `SELECT AVG(na.current_activation) FROM node_activation na
         JOIN edges e ON e.child_uuid = na.node_uuid
         JOIN paths p ON p.edge_id = e.id AND p.namespace = ?`, [ns]
      );
      return Response.json({
        total_edges: edgeCount?.[0] ?? 0,
        total_episodes: episodeCount?.[0] ?? 0,
        active_nodes: activeNodeCount?.[0] ?? 0,
        avg_activation: avgActivation?.[0] ? Math.round(avgActivation[0] * 10000) / 10000 : 0.0,
      });
    }

    if (pathname === "/api/brain/last-operation" && req.method === "GET") {
      return Response.json({ found: false, namespace: ns });
    }

    // ------------------------------------------------------------------
    // Maintenance API
    // ------------------------------------------------------------------
    if (pathname === "/api/maintenance/orphans" && req.method === "GET") {
      // Deprecated memories
      const depRows = await db.fetchall<[number, string, string, string, number, string | null, string, string]>(
        `SELECT m.id, m.node_uuid, p.domain, p.path, e.priority, e.disclosure, m.created_at, m.content
         FROM memories m
         JOIN edges e ON e.child_uuid = m.node_uuid
         JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
         WHERE m.deprecated = 1 AND m.migrated_to IS NOT NULL
         ORDER BY m.created_at DESC`,
        [ns]
      );
      const deprecated = depRows.map(([id, node_uuid, domain, path, priority, disclosure, created_at, content]) => {
        const snippet = content ? (content.slice(0, 120).replace(/\n/g, " ") + (content.length > 120 ? "..." : "")) : "";
        return {
          id, node_uuid, category: "deprecated",
          uri: `${domain}://${path}`, domain, path, priority, disclosure, created_at,
          content_snippet: snippet,
        };
      });

      // Orphaned memories (deprecated with no migrated_to and no active paths)
      const orphanRows = await db.fetchall<[number, string, string | null, string]>(
        `SELECT m.id, m.node_uuid, m.content, m.created_at
         FROM memories m
         WHERE m.deprecated = 1 AND m.migrated_to IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM edges e2
             JOIN paths p2 ON p2.edge_id = e2.id AND p2.namespace = ?
             WHERE e2.child_uuid = m.node_uuid
           )
         ORDER BY m.created_at DESC`,
        [ns]
      );
      const orphaned = orphanRows.map(([id, node_uuid, content, created_at]) => {
        const snippet = content ? (content.slice(0, 120).replace(/\n/g, " ") + (content.length > 120 ? "..." : "")) : "";
        return {
          id, node_uuid, category: "orphaned",
          uri: null, domain: null, path: null, priority: null, disclosure: null, created_at, content,
          content_snippet: snippet,
        };
      });

      return Response.json([...deprecated, ...orphaned]);
    }

    if (pathname.startsWith("/api/maintenance/orphans/") && req.method === "GET") {
      const id = parseInt(pathname.slice("/api/maintenance/orphans/".length), 10);
      if (Number.isNaN(id)) return Response.json({ detail: "Invalid id" }, { status: 400 });
      const row = await db.fetchone<[number, string, string | null, number | null, string, number | null]>(
        `SELECT m.id, m.node_uuid, m.content, m.deprecated, m.created_at, m.migrated_to
         FROM memories m WHERE m.id = ?`, [id]
      );
      if (!row) return Response.json({ detail: "Not found" }, { status: 404 });
      const [, node_uuid, content, deprecated, created_at, migrated_to] = row;
      let targetContent: string | null = null;
      if (migrated_to) {
        const target = await db.fetchone<[string]>(`SELECT content FROM memories WHERE id = ?`, [migrated_to]);
        if (target) targetContent = target[0];
      }
      return Response.json({ id, node_uuid, content, deprecated, created_at, migrated_to, target_content: targetContent });
    }

    if (pathname.startsWith("/api/maintenance/orphans/") && req.method === "DELETE") {
      const id = parseInt(pathname.slice("/api/maintenance/orphans/".length), 10);
      if (Number.isNaN(id)) return Response.json({ detail: "Invalid id" }, { status: 400 });
      const memRow = await db.fetchone<[string, number | null]>(
        `SELECT node_uuid, migrated_to FROM memories WHERE id = ? AND deprecated = 1`, [id]
      );
      if (!memRow) return Response.json({ detail: "Not found or not deprecated" }, { status: 404 });
      const [nodeUuid, migratedTo] = memRow;
      // repair chain
      if (migratedTo) {
        await db.execute(`UPDATE memories SET migrated_to = ? WHERE migrated_to = ?`, [migratedTo, id]);
      }
      await db.execute(`DELETE FROM memories WHERE id = ?`, [id]);
      // soft GC node
      const edgeCount = await db.fetchone<[number]>(
        `SELECT COUNT(*) FROM edges WHERE parent_uuid = ? OR child_uuid = ?`, [nodeUuid, nodeUuid]
      );
      if (edgeCount && edgeCount[0] === 0 && nodeUuid !== ROOT_NODE_UUID) {
        await db.execute(`DELETE FROM memories WHERE node_uuid = ?`, [nodeUuid]);
        await db.execute(`DELETE FROM glossary_keywords WHERE node_uuid = ?`, [nodeUuid]);
        await db.execute(`DELETE FROM nodes WHERE uuid = ?`, [nodeUuid]);
      }
      return Response.json({ success: true, deleted_memory_id: id });
    }

    return new Response("Not Found", { status: 404 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
