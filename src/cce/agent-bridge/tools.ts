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
import type { AssociativeNetwork } from "../brain/associative-network.js";
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
  associative: AssociativeNetwork;
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
          `Priority: ★${String(memory['priority'])}`,
        ];
        if (memory['disclosure']) lines.push(`When to recall: ${String(memory['disclosure'])}`);
        lines.push("", "=".repeat(60), "", memory['content'] as string, "");

        const children = await deps.graph.getChildren(memory['node_uuid'] as string, domain, path, namespace);
        if (children.length > 0) {
          lines.push("=".repeat(60), "", "SUB-CONTEXTS", "=".repeat(60), "");
          for (const child of children) {
            const childUri = makeUri(child['domain'] as string, child['path'] as string);
            lines.push(`- URI: ${childUri} [★${String(child['priority'])}]`);
            if (child['disclosure']) lines.push(`  When to recall: ${String(child['disclosure'])}`);
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
          lines.push(`- ${childUri} [★${String(child['priority'])}]`);
          lines.push(`  ${String(child['content_snippet'])}`);
          if (child['disclosure']) lines.push(`  When to recall: ${String(child['disclosure'])}`);
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

    // ─── delete_context ───
    defineTool({
      name: "delete_context",
      label: "CCE: Delete context by URI",
      description: "Deletes a context node and its sub-tree by URI. Use with care.",
      parameters: Type.Object({
        uri: Type.String({ description: "Context URI to delete, e.g. concept://old_idea" }),
      }),
      execute: async (_id, params) => {
        const { uri } = params as { uri: string };
        const namespace = ns();
        const [domain, path] = parseUri(uri);
        if (domain === "system") {
          return { details: {}, content: [{ type: "text", text: "Cannot delete system:// nodes." }], isError: true };
        }
        const result = await deps.graph.deletePath(path, domain, namespace);
        return { details: result, content: [{ type: "text", text: `Deleted ${result.deleted_uri}${result.node_uuid ? ` (node: ${result.node_uuid})` : ""}` }] };
      },
    }),

    // ─── link_context ───
    defineTool({
      name: "link_context",
      label: "CCE: Link two context nodes",
      description: "Creates an associative link between any two context nodes (bidirectional).",
      parameters: Type.Object({
        from_uri: Type.String(),
        to_uri: Type.String(),
      }),
      execute: async (_id, params) => {
        const { from_uri, to_uri } = params as { from_uri: string; to_uri: string };
        const namespace = ns();
        const [fd, fp] = parseUri(from_uri);
        const [td, tp] = parseUri(to_uri);
        const fromMem = await deps.graph.getMemoryByPath(fp, fd, namespace);
        const toMem = await deps.graph.getMemoryByPath(tp, td, namespace);
        if (!fromMem) return { details: {}, content: [{ type: "text", text: `From URI '${from_uri}' not found.` }], isError: true };
        if (!toMem) return { details: {}, content: [{ type: "text", text: `To URI '${to_uri}' not found.` }], isError: true };

        await deps.associative.reinforce(fromMem['node_uuid'] as string, toMem['node_uuid'] as string, 0.05);
        await deps.associative.reinforce(toMem['node_uuid'] as string, fromMem['node_uuid'] as string, 0.05);
        return { details: {}, content: [{ type: "text", text: `Linked ${from_uri} <-> ${to_uri}` }] };
      },
    }),

    // ─── commit_insight ───
    defineTool({
      name: "commit_insight",
      label: "CCE: Commit insight to memory",
      description:
        "Captures a durable insight and links it to all currently active Working Memory nodes. " +
        "Prefer this over write_context when the insight is related to the current conversation. " +
        "Automatically creates a memory:// node and associative links.",
      parameters: Type.Object({
        title: Type.String({ description: "Short semantic title for the insight" }),
        content: Type.String({ description: "The insight text to preserve" }),
        linked_code_uris: Type.Optional(Type.Array(Type.String(), { description: "Optional code:// URIs to link as evidence" })),
      }),
      execute: async (_id, params) => {
        const { title, content, linked_code_uris } = params as { title: string; content: string; linked_code_uris?: string[] };
        const namespace = ns();
        const uri = `memory://${title}`;

        // Create or update memory:// node
        const [domain, path] = parseUri(uri);
        const existing = await deps.graph.getMemoryByPath(path, domain, namespace);
        let nodeUuid: string;
        if (existing) {
          await deps.graph.updateMemory(path, content, domain, namespace);
          nodeUuid = existing['node_uuid'] as string;
        } else {
          const result = await deps.graph.createMemory("", content, 1, title, null, domain, namespace);
          nodeUuid = result['node_uuid'] as string;
        }

        // Link to all current WM slots
        const pool = deps.wm.getPool(namespace);
        const linked: string[] = [];
        for (const slot of pool.slots) {
          if (slot.node_uuid === nodeUuid) continue;
          await deps.associative.reinforce(nodeUuid, slot.node_uuid, 0.05);
          linked.push(slot.uri);
        }

        // Optional code evidence links
        let codeLinked = 0;
        if (linked_code_uris && linked_code_uris.length > 0) {
          const codeUuids: string[] = [];
          for (const cu of linked_code_uris) {
            const [cd, cp] = parseUri(cu);
            const codeMem = await deps.graph.getMemoryByPath(cp, cd, namespace);
            if (codeMem) codeUuids.push(codeMem['node_uuid'] as string);
          }
          if (codeUuids.length > 0) {
            await deps.graph.linkCodeNodes(nodeUuid, codeUuids, namespace);
            codeLinked = codeUuids.length;
          }
        }

        return {
          details: { uri, linked_count: linked.length, code_linked: codeLinked },
          content: [{ type: "text", text: `Insight committed to ${uri}. Linked to ${linked.length} WM node(s)${codeLinked > 0 ? `, ${codeLinked} code node(s)` : ""}.` }],
        };
      },
    }),

    // ─── update_boot ───
    defineTool({
      name: "update_boot",
      label: "CCE: Update system boot context",
      description: "Updates the system://boot context, which is loaded into Working Memory at session start.",
      parameters: Type.Object({
        content: Type.String({ description: "New boot context content" }),
      }),
      execute: async (_id, params) => {
        const { content } = params as { content: string };
        const namespace = ns();
        const result = await deps.graph.updateBoot(content, namespace);
        return { details: result, content: [{ type: "text", text: `Updated system://boot (memory id: ${String(result['id'])})` }] };
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
    const key = `${String(item['domain'])}::${String(item['node_uuid'])}`;
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
    lines.push(`- ${String(entry['keyword'])}`);
    for (const node of (entry['nodes'] as Array<Record<string, unknown>>)) {
      lines.push(`  -> ${String(node['uri'])}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
