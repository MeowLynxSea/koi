/**
 * CCE Native Tools — Pi ToolDefinitions for Cat's Context Engine.
 *
 * All tools are namespace-agnostic; the namespace is resolved automatically
 * from process.cwd() via CceNamespaceContext.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { GraphService } from "../graph/graph-service.js";
import type { SearchIndexer } from "../graph/search-indexer.js";
import type { GlossaryService } from "../graph/glossary-service.js";
import type { ActivationEngine } from "../brain/activation-engine.js";
import type { WorkingMemoryManager } from "../brain/working-memory.js";
import { getNamespaceContext } from "./namespace-context.js";

const DEFAULT_DOMAIN = "code";
const VALID_DOMAINS = ["code", "concept", "memory", "system"];

function parseUri(uri: string): [string, string] {
  const m = uri.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*):\/\/(.*)$/);
  if (m) {
    const domain = m[1]!.toLowerCase();
    const path = m[2]!.trim().replace(/^\/+/, "");
    if (!VALID_DOMAINS.includes(domain) && domain !== "system") {
      throw new Error(`Unknown domain '${domain}'. Valid: ${VALID_DOMAINS.join(", ")}`);
    }
    return [domain, path];
  }
  return [DEFAULT_DOMAIN, uri.trim().replace(/^\/+/, "")];
}

function makeUri(domain: string, path: string): string {
  return `${domain}://${path}`;
}

export interface CceToolDeps {
  graph: GraphService;
  search: SearchIndexer;
  glossary: GlossaryService;
  activation: ActivationEngine;
  wm: WorkingMemoryManager;
}

export function createCceToolDefinitions(deps: CceToolDeps): ToolDefinition[] {
  const ns = () => getNamespaceContext().current;

  return [
    // ─── read_context ───
    defineTool({
      name: "read_context",
      label: "CCE: Read context by URI",
      description: "Reads a context node by its URI. Special system URIs: system://boot, system://index, system://recent, system://glossary.",
      parameters: Type.Object({
        uri: Type.String({ description: "Context URI, e.g. code://src/auth.ts or system://boot" }),
      }),
      execute: async (_id, params) => {
        const { uri } = params as { uri: string };
        const namespace = ns();

        if (uri.trim() === "system://boot") {
          return { details: {}, content: [{ type: "text", text: await _generateBootView(deps.graph, namespace) }] };
        }
        if (uri.trim() === "system://index" || uri.trim().startsWith("system://index/")) {
          const domainFilter = uri.trim().slice("system://index".length).replace(/^\/+/, "") || null;
          return { details: {}, content: [{ type: "text", text: await _generateIndexView(deps.graph, namespace, domainFilter) }] };
        }
        if (uri.trim() === "system://recent" || uri.trim().startsWith("system://recent/")) {
          const suffix = uri.trim().slice("system://recent".length).replace(/^\/+/, "");
          const limit = suffix ? Math.max(1, Math.min(100, parseInt(suffix, 10) || 10)) : 10;
          return { details: {}, content: [{ type: "text", text: await _generateRecentView(deps.graph, namespace, limit) }] };
        }
        if (uri.trim() === "system://glossary") {
          return { details: {}, content: [{ type: "text", text: await _generateGlossaryView(deps.glossary, namespace) }] };
        }

        const [domain, path] = parseUri(uri);
        const memory = await deps.graph.getMemoryByPath(path, domain, namespace);
        if (!memory) {
          return { details: {}, content: [{ type: "text", text: `URI '${uri}' not found.` }], isError: true };
        }

        const lines = [
          "=".repeat(60),
          "",
          `CONTEXT: ${makeUri(domain, path)}`,
          `Priority: ★${memory['priority']}`,
        ];
        if (memory['disclosure']) lines.push(`When to recall: ${memory['disclosure']}`);
        lines.push("", "=".repeat(60), "", memory['content'] as string, "");

        const children = await deps.graph.getChildren(memory['node_uuid'] as string, domain, path, namespace);
        if (children.length > 0) {
          lines.push("=".repeat(60), "", "SUB-CONTEXTS", "=".repeat(60), "");
          for (const child of children) {
            const childUri = makeUri(child['domain'] as string, child['path'] as string);
            lines.push(`- URI: ${childUri} [★${child['priority']}]`);
            if (child['disclosure']) lines.push(`  When to recall: ${child['disclosure']}`);
            else lines.push("  When to recall: (not set)");
            lines.push("");
          }
        }

        // Activate node
        await deps.graph.activateNode(memory['node_uuid'] as string, uri, 1.0);
        await deps.wm.manualInject(namespace, uri, memory['content'] as string, 0.95);

        return { details: {}, content: [{ type: "text", text: lines.join("\n") }] };
      },
    }),

    // ─── write_context ───
    defineTool({
      name: "write_context",
      label: "CCE: Create or update context",
      description: "Creates or updates a context node at the given URI.",
      parameters: Type.Object({
        uri: Type.String(),
        content: Type.String(),
        priority: Type.Number({ default: 0 }),
        disclosure: Type.Optional(Type.String()),
      }),
      execute: async (_id, params) => {
        const { uri, content, priority, disclosure } = params as { uri: string; content: string; priority: number; disclosure?: string };
        const namespace = ns();
        const [domain, path] = parseUri(uri);
        const existing = await deps.graph.getMemoryByPath(path, domain, namespace);
        if (existing) {
          await deps.graph.updateMemory(path, content, domain, namespace, priority, disclosure ?? null);
          return { details: {}, content: [{ type: "text", text: `Updated ${uri}` }] };
        }
        const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        const title = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
        await deps.graph.createMemory(parentPath, content, priority, title, disclosure ?? null, domain, namespace);
        return { details: {}, content: [{ type: "text", text: `Created ${uri}` }] };
      },
    }),

    // ─── search_context ───
    defineTool({
      name: "search_context",
      label: "CCE: Search contexts",
      description: "Hybrid search across all context nodes using keyword + semantic fusion.",
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Number({ default: 10 }),
      }),
      execute: async (_id, params) => {
        const { query, limit } = params as { query: string; limit: number };
        const namespace = ns();
        const results = await deps.search.search(query, limit, null, namespace);
        if (results.length === 0) {
          return { details: {}, content: [{ type: "text", text: "No results found." }] };
        }
        const lines = [`# Search Results for "${query}"`, ""];
        for (const r of results) {
          const scoreStr = r['score'] !== undefined ? ` (score: ${(r['score'] as number).toFixed(2)})` : "";
          lines.push(`- ${r['uri']}${scoreStr}`);
          lines.push(`  ${r['snippet']}`);
          lines.push("");
        }
        return { details: {}, content: [{ type: "text", text: lines.join("\n") }] };
      },
    }),

    // ─── browse_context ───
    defineTool({
      name: "browse_context",
      label: "CCE: Browse child contexts",
      description: "Lists sub-contexts under a given URI. If no URI provided, lists root-level contexts.",
      parameters: Type.Object({
        uri: Type.Optional(Type.String()),
      }),
      execute: async (_id, params) => {
        const { uri } = params as { uri?: string };
        const namespace = ns();
        let nodeUuid: string;
        let domain: string | null = null;
        let cpath: string | null = null;

        if (uri) {
          const [d, p] = parseUri(uri);
          domain = d;
          cpath = p;
          const mem = await deps.graph.getMemoryByPath(p, d, namespace);
          if (!mem) return { details: {}, content: [{ type: "text", text: `URI '${uri}' not found.` }], isError: true };
          nodeUuid = mem['node_uuid'] as string;
        } else {
          nodeUuid = "00000000-0000-0000-0000-000000000000";
        }

        const children = await deps.graph.getChildren(nodeUuid, domain, cpath, namespace);
        if (children.length === 0) {
          return { details: {}, content: [{ type: "text", text: "No sub-contexts found." }] };
        }
        const lines = ["# Sub-Contexts", ""];
        for (const child of children) {
          const childUri = makeUri(child['domain'] as string, child['path'] as string);
          lines.push(`- ${childUri} [★${child['priority']}]`);
          lines.push(`  ${child['content_snippet']}`);
          if (child['disclosure']) lines.push(`  When to recall: ${child['disclosure']}`);
          lines.push("");
        }
        return { details: {}, content: [{ type: "text", text: lines.join("\n") }] };
      },
    }),

    // ─── manage_triggers ───
    defineTool({
      name: "manage_triggers",
      label: "CCE: Manage glossary triggers",
      description: "Add or remove keyword triggers for a context node.",
      parameters: Type.Object({
        uri: Type.String(),
        add: Type.Optional(Type.Array(Type.String())),
        remove: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_id, params) => {
        const { uri, add, remove } = params as { uri: string; add?: string[]; remove?: string[] };
        const namespace = ns();
        const [domain, path] = parseUri(uri);
        const mem = await deps.graph.getMemoryByPath(path, domain, namespace);
        if (!mem) return { details: {}, content: [{ type: "text", text: `URI '${uri}' not found.` }], isError: true };
        const nodeUuid = mem['node_uuid'] as string;

        const added: string[] = [];
        const removed: string[] = [];

        if (add) {
          for (const kw of add) {
            try {
              await deps.glossary.addGlossaryKeyword(kw, nodeUuid, namespace);
              added.push(kw);
            } catch {
              // ignore duplicate
            }
          }
        }
        if (remove) {
          for (const kw of remove) {
            await deps.glossary.removeGlossaryKeyword(kw, nodeUuid, namespace);
            removed.push(kw);
          }
        }

        return { details: {}, content: [{ type: "text", text: `Added: ${added.join(", ") || "none"}\nRemoved: ${removed.join(", ") || "none"}` }] };
      },
    }),

    // ─── link_code ───
    defineTool({
      name: "link_code",
      label: "CCE: Link memory to code",
      description: "Link a memory node to one or more code nodes.",
      parameters: Type.Object({
        memory_uri: Type.String(),
        code_uris: Type.Array(Type.String()),
      }),
      execute: async (_id, params) => {
        const { memory_uri, code_uris } = params as { memory_uri: string; code_uris: string[] };
        const namespace = ns();
        const [md, mp] = parseUri(memory_uri);
        const mem = await deps.graph.getMemoryByPath(mp, md, namespace);
        if (!mem) return { details: {}, content: [{ type: "text", text: `Memory URI '${memory_uri}' not found.` }], isError: true };

        const codeUuids: string[] = [];
        for (const cu of code_uris) {
          const [cd, cp] = parseUri(cu);
          const codeMem = await deps.graph.getMemoryByPath(cp, cd, namespace);
          if (codeMem) codeUuids.push(codeMem['node_uuid'] as string);
        }

        const result = await deps.graph.linkCodeNodes(mem['node_uuid'] as string, codeUuids, namespace);
        return { details: {}, content: [{ type: "text", text: `Linked ${(result['added'] as string[]).length} code node(s). Skipped: ${(result['skipped'] as string[]).length}` }] };
      },
    }),

    // ─── session_start ───
    defineTool({
      name: "session_start",
      label: "CCE: Initialize session memory",
      description: "Initializes Working Memory with core contexts for the current project.",
      parameters: Type.Object({}),
      execute: async () => {
        const namespace = ns();
        // Load system://boot into WM
        const boot = await deps.graph.getMemoryByPath("boot", "system", namespace);
        if (boot) {
          await deps.wm.manualInject(namespace, "system://boot", boot['content'] as string, 0.9);
        }

        const wmText = deps.wm.formatPool(namespace);
        return {
          details: {},
          content: [{
            type: "text",
            text: wmText
              ? `=== Working Memory Initialized ===\n\n${wmText}`
              : "(No active contexts in Working Memory)",
          }],
        };
      },
    }),

    // ─── get_working_memory ───
    defineTool({
      name: "get_working_memory",
      label: "CCE: Inspect Working Memory",
      description: "Shows the current Working Memory pool contents.",
      parameters: Type.Object({}),
      execute: async () => {
        const namespace = ns();
        const state = deps.wm.getPoolDict(namespace);
        const lines = [
          `=== Working Memory — ${state['occupied']}/${state['capacity']} slots ===`,
          "",
        ];
        for (const slot of (state['slots'] as Array<Record<string, unknown>>)) {
          lines.push(`- ${slot['uri']} [score: ${slot['relevance_score']}, source: ${slot['activation_source']}]`);
        }
        lines.push("");
        return { details: {}, content: [{ type: "text", text: lines.join("\n") }] };
      },
    }),

    // ─── process_utterance ───
    defineTool({
      name: "process_utterance",
      label: "CCE: Process utterance for memory",
      description: "Processes a user message or agent thought to update Working Memory via the Activation Engine.",
      parameters: Type.Object({
        text: Type.String(),
      }),
      execute: async (_id, params) => {
        const { text } = params as { text: string };
        const namespace = ns();
        const activated = await deps.activation.computeActivations(text, namespace, 50);
        const changes = await deps.wm.updateFromActivations(namespace, activated, text);

        // Record episode for top node
        if (changes.activated_nodes.length > 0) {
          const top = changes.activated_nodes.reduce((a, b) => ((a['score'] as number) > (b['score'] as number) ? a : b));
          try {
            await deps.graph.recordEpisode(
              top['node_uuid'] as string,
              "conversation",
              top['uri'] as string,
              text.slice(0, 500),
              deps.wm.getPool(namespace).slots.map((s) => s.node_uuid),
              top['score'] as number
            );
          } catch {
            // ignore
          }
        }

        const lines = [
          "=== Memory Update ===",
          `Inserted: ${changes.inserted.length}`,
          `Refreshed: ${changes.refreshed.length}`,
          `Evicted: ${changes.evicted.length}`,
          `Rejected: ${changes.rejected.length}`,
          "",
          deps.wm.formatPool(namespace),
        ];
        return { details: {}, content: [{ type: "text", text: lines.join("\n") }] };
      },
    }),
  ];
}

// ─── View generators ───

async function _generateBootView(graph: GraphService, namespace: string): Promise<string> {
  const lines = ["# Core Contexts", ""];
  const boot = await graph.getMemoryByPath("boot", "system", namespace);
  if (boot) {
    lines.push(boot['content'] as string);
  } else {
    lines.push("(No boot context found. Run sync to generate one.)");
  }
  lines.push("");
  lines.push(await _generateRecentView(graph, namespace, 5));
  return lines.join("\n");
}

async function _generateIndexView(
  graph: GraphService,
  namespace: string,
  domainFilter: string | null
): Promise<string> {
  const paths = await graph.getAllPaths(domainFilter, namespace);
  const nodeGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const item of paths) {
    const key = `${item['domain']}::${item['node_uuid']}`;
    if (!nodeGroups.has(key)) nodeGroups.set(key, []);
    nodeGroups.get(key)!.push(item);
  }

  const entries = Array.from(nodeGroups.values()).map((items) => {
    items.sort((a, b) => {
      const depthA = ((a['path'] as string) || "").split("/").length;
      const depthB = ((b['path'] as string) || "").split("/").length;
      if (depthA !== depthB) return depthA - depthB;
      const priA = (a['priority'] as number) || 0;
      const priB = (b['priority'] as number) || 0;
      if (priA !== priB) return priA - priB;
      return ((a['path'] as string) || "").length - ((b['path'] as string) || "").length;
    });
    return items[0]!;
  });

  const domains = new Map<string, Map<string, Array<Record<string, unknown>>>>();
  for (const primary of entries) {
    if (!primary) continue;
    const domain = (primary['domain'] as string) || DEFAULT_DOMAIN;
    if (!domains.has(domain)) domains.set(domain, new Map());
    const pathStr = (primary['path'] as string) || "";
    const topLevel = pathStr ? pathStr.split("/")[0]! : "(root)";
    if (!domains.get(domain)!.has(topLevel)) domains.get(domain)!.set(topLevel, []);
    domains.get(domain)!.get(topLevel)!.push(primary);
  }

  const lines = [
    "# Context Index",
    `# Total: ${entries.length} unique nodes`,
    "",
  ];

  for (const domainName of Array.from(domains.keys()).sort()) {
    if (domainFilter && domainName !== domainFilter) continue;
    lines.push(`# ══════════════════════════════════════`);
    lines.push(`# DOMAIN: ${domainName}://`);
    lines.push(`# ══════════════════════════════════════`, "");
    const groups = domains.get(domainName)!;
    for (const groupName of Array.from(groups.keys()).sort()) {
      lines.push(`## ${groupName}`);
      for (const primary of groups.get(groupName)!.sort((a, b) => ((a['path'] as string) || "").localeCompare((b['path'] as string) || ""))) {
        const uri = (primary['uri'] as string) || makeUri(domainName, (primary['path'] as string) || "");
        const priority = (primary['priority'] as number) || 0;
        lines.push(`  - ${uri} [★${priority}]`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function _generateRecentView(graph: GraphService, namespace: string, limit: number): Promise<string> {
  const results = await graph.getRecentMemories(limit, namespace);
  const lines = ["# Recently Modified Contexts", ""];
  if (results.length === 0) {
    lines.push("(No contexts found.)");
    return lines.join("\n");
  }
  for (let i = 0; i < results.length; i++) {
    const item = results[i]!;
    const uri = item['uri'] as string;
    const priority = (item['priority'] as number) || 0;
    const disclosure = item['disclosure'] as string | null;
    const rawTs = (item['created_at'] as string) || "";
    const modified = rawTs.length >= 16 ? rawTs.slice(0, 10) + " " + rawTs.slice(11, 16) : rawTs || "unknown";
    lines.push(`${i + 1}. ${uri} [★${priority}] modified: ${modified}`);
    if (disclosure) lines.push(`   disclosure: ${disclosure}`);
    else lines.push("   disclosure: (NOT SET)");
    lines.push("");
  }
  return lines.join("\n");
}

async function _generateGlossaryView(glossary: GlossaryService, namespace: string): Promise<string> {
  const entries = await glossary.getAllGlossary(namespace);
  const lines = ["# Glossary Index", `# Total: ${entries.length} keywords`, ""];
  if (entries.length === 0) {
    lines.push("(No glossary keywords defined yet.)");
    return lines.join("\n");
  }
  for (const entry of entries) {
    lines.push(`- ${entry['keyword']}`);
    for (const node of (entry['nodes'] as Array<Record<string, unknown>>)) {
      lines.push(`  -> ${node['uri']}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
