/**
 * CCE Web Server — Lightweight Bun HTTP server for the CCE dashboard.
 */

import { getNamespaceContext } from "../agent-bridge/namespace-context.js";
import { getDbManager } from "../core/db.js";
import { initDb } from "../core/init.js";
import { GraphService } from "../graph/graph-service.js";
import { SearchIndexer } from "../graph/search-indexer.js";
import { EmbeddingService } from "../graph/embedding-service.js";
import { GlossaryService } from "../graph/glossary-service.js";
import { WorkingMemoryManager } from "../brain/working-memory.js";

export function createCceWebServer(port: number) {
  const sseClients = new Set<ReturnType<typeof Bun.serve>["upgrade"]>();

  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // SSE endpoint
      if (pathname === "/api/events") {
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));
              const send = (data: string) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                  // client disconnected
                }
              };
              (sseClients as any).add(send);
            },
          }),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } }
        );
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        return await handleApi(req, pathname);
      }

      // Static files
      if (pathname === "/" || pathname === "/index.html") {
        const html = await Bun.file(new URL("./static/index.html", import.meta.url)).text();
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
      if (pathname === "/style.css") {
        const css = await Bun.file(new URL("./static/style.css", import.meta.url)).text();
        return new Response(css, { headers: { "Content-Type": "text/css" } });
      }
      if (pathname === "/app.js") {
        const js = await Bun.file(new URL("./static/app.js", import.meta.url)).text();
        return new Response(js, { headers: { "Content-Type": "application/javascript" } });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

async function handleApi(req: Request, pathname: string): Promise<Response> {
  const ns = getNamespaceContext().current;
  const db = getDbManager(ns);
  await initDb(db);

  const embedding = new EmbeddingService();
  const search = new SearchIndexer(db, embedding);
  const glossary = new GlossaryService(db, search);
  const graph = new GraphService(db, search);
  const wm = new WorkingMemoryManager(graph);

  try {
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
      let nodeUuid = "00000000-0000-0000-0000-000000000000";
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

    return new Response("Not Found", { status: 404 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
