/**
 * FuzzySearch Tool — Unified fuzzy search across code, concepts, and working memory.
 *
 * Searches:
 *   1. Code files (fast-glob + content scan)
 *   2. CCE concepts & memories (if CCE is initialized)
 *   3. Session working memory (if CCE is initialized)
 */

import { Type } from "typebox";
import fg from "fast-glob";
import { readFileSync, statSync } from "fs";
import { resolve } from "path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import { checkPermission } from "../agent/check-permissions.js";
import { requestPermission } from "../agent/permission-ui.js";
import type { ToolResultWithError } from "./types.js";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const fuzzySearchSchema = Type.Object({
  query: Type.String({ description: "Fuzzy search query (keywords or natural language)" }),
  domain: Type.Optional(
    Type.Union(
      [Type.Literal("code"), Type.Literal("concept"), Type.Literal("memory"), Type.Literal("all")],
      { description: "Search domain: code | concept | memory | all (default: all)" }
    )
  ),
  limit: Type.Optional(Type.Number({ description: "Max results per domain (default: 10)" })),
  glob: Type.Optional(Type.String({ description: "Filter code files by glob, e.g. '*.ts'" })),
});

export type FuzzySearchInput = {
  query: string;
  domain?: "code" | "concept" | "memory" | "all";
  limit?: number;
  glob?: string;
};

// ─── Code Search (fallback) ───────────────────────────────────────────────────

interface CodeResult {
  file: string;
  line: number;
  text: string;
  score: number;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.includes(q)) return 50 + Math.round((q.length / t.length) * 30);
  // Simple token matching
  const tokens = q.split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const tok of tokens) if (t.includes(tok)) matches++;
  return matches > 0 ? Math.round((matches / tokens.length) * 30) : 0;
}

async function searchCode(params: FuzzySearchInput): Promise<CodeResult[]> {
  const cwd = process.cwd();
  const pattern = params.glob ?? "**/*";
  const files = await fg(pattern, {
    cwd,
    dot: true,
    onlyFiles: true,
    ignore: ["node_modules", ".git", "dist", ".cce"],
  });

  const results: CodeResult[] = [];
  const limit = params.limit ?? 10;

  for (const rel of files.slice(0, 200)) {
    const full = resolve(cwd, rel);
    try {
      const stats = statSync(full);
      if (stats.size > 256 * 1024) continue; // Skip large files
      const content = readFileSync(full, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const score = fuzzyScore(params.query, lines[i]!);
        if (score > 0) {
          results.push({ file: rel, line: i + 1, text: lines[i]!.trim(), score });
        }
      }
    } catch {
      // ignore unreadable
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ─── CCE Search ───────────────────────────────────────────────────────────────

interface ConceptResult {
  uri: string;
  snippet: string;
  score?: number;
}

async function searchCceConcepts(query: string, limit: number): Promise<ConceptResult[]> {
  try {
    const { getCceSystem } = await import("../cce/index.js");
    const cce = getCceSystem();
    if (!cce) return [];
    const namespace = process.cwd();
    const rows = await cce.search.search(query, limit, null, namespace);
    return rows.map((r) => ({
      uri: String(r["uri"]),
      snippet: String(r["snippet"]),
      score: (r as { score?: number }).score,
    }));
  } catch {
    return [];
  }
}

async function searchCceMemory(query: string, limit: number): Promise<ConceptResult[]> {
  try {
    const { getCceSystem } = await import("../cce/index.js");
    const cce = getCceSystem();
    if (!cce) return [];
    const namespace = process.cwd();
    const pool = cce.wm.getPool(namespace);
    const results: ConceptResult[] = [];
    for (const slot of pool.slots) {
      const score = fuzzyScore(query, slot.content);
      if (score > 0) {
        results.push({ uri: slot.uri, snippet: slot.content.slice(0, 200), score });
      }
    }
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function executeFuzzySearch(
  params: FuzzySearchInput
): Promise<{ content: TextContent[]; details: { code: number; concept: number; memory: number } }> {
  const domain = params.domain ?? "all";
  const limit = params.limit ?? 10;
  const lines: string[] = [`# Fuzzy Search: "${params.query}"`, ""];

  let codeCount = 0;
  let conceptCount = 0;
  let memoryCount = 0;

  if (domain === "all" || domain === "code") {
    const codeResults = await searchCode(params);
    codeCount = codeResults.length;
    if (codeCount > 0) {
      lines.push(`## Code Matches (${codeCount})`);
      for (const r of codeResults) {
        lines.push(`- ${r.file}:${r.line}  (score: ${r.score})`);
        lines.push(`  \`${r.text.slice(0, 120)}\``);
      }
      lines.push("");
    }
  }

  if (domain === "all" || domain === "concept") {
    const conceptResults = await searchCceConcepts(params.query, limit);
    conceptCount = conceptResults.length;
    if (conceptCount > 0) {
      lines.push(`## Concept Matches (${conceptCount})`);
      for (const r of conceptResults) {
        lines.push(`- ${r.uri}${r.score !== undefined ? ` (score: ${r.score.toFixed(2)})` : ""}`);
        lines.push(`  ${r.snippet.slice(0, 200)}`);
      }
      lines.push("");
    }
  }

  if (domain === "all" || domain === "memory") {
    const memResults = await searchCceMemory(params.query, limit);
    memoryCount = memResults.length;
    if (memoryCount > 0) {
      lines.push(`## Working Memory Matches (${memoryCount})`);
      for (const r of memResults) {
        lines.push(`- ${r.uri}${r.score !== undefined ? ` (score: ${r.score})` : ""}`);
        lines.push(`  ${r.snippet.slice(0, 200)}`);
      }
      lines.push("");
    }
  }

  if (codeCount + conceptCount + memoryCount === 0) {
    lines.push("No matches found.");
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { code: codeCount, concept: conceptCount, memory: memoryCount },
  };
}

// ─── Tool Definition Factory ──────────────────────────────────────────────────

export function createFuzzySearchToolDefinition(_cwd: string): ToolDefinition<typeof fuzzySearchSchema, { code: number; concept: number; memory: number }> {
  return {
    name: "fuzzySearch",
    label: "FuzzySearch",
    description:
      "Fuzzy search across code, concepts, and working memory.\n\n" +
      "- Searches file contents using fuzzy string matching\n" +
      "- Searches CCE concept graph (if initialized)\n" +
      "- Searches active working memory slots (if initialized)\n" +
      "- Use domain: 'code' | 'concept' | 'memory' | 'all' to filter",
    promptSnippet: "FuzzySearch: unified fuzzy search across code, concepts, and memories",
    parameters: fuzzySearchSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const perm = checkPermission("fuzzySearch", params);
      if (perm.decision === "deny") {
        const result: ToolResultWithError<{ code: number; concept: number; memory: number }> = {
          content: [{ type: "text", text: `Permission denied: ${perm.reason ?? "search blocked"}` }],
          details: { code: 0, concept: 0, memory: 0 },
          isError: true,
        };
        return result;
      }
      if (perm.decision === "ask") {
        const allowed = await requestPermission({
          toolName: "fuzzySearch",
          args: params,
          reason: perm.reason ?? "Confirm search",
        });
        if (!allowed) {
          const result: ToolResultWithError<{ code: number; concept: number; memory: number }> = {
            content: [{ type: "text", text: "User denied permission to search." }],
            details: { code: 0, concept: 0, memory: 0 },
            isError: true,
          };
          return result;
        }
      }
      return executeFuzzySearch(params);
    },
  };
}
