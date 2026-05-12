/**
 * Disclosure Engine — evaluates disclosure rules per round.
 *
 * Disclosure strings support a lightweight DSL:
 *   "when: keyword(auth, login)"      → trigger if keyword found
 *   "when: file(src/auth/*.ts)"       → trigger if matching files active
 *   "when: topic(security)"           → trigger based on conversation topic
 *   "always"                          → always include
 */

import type { GraphService } from "../graph/graph-service.js";
import type { GlossaryService } from "../graph/glossary-service.js";

export interface DisclosureMatch {
  node_uuid: string;
  uri: string;
  content: string;
  reason: string;
}

export class DisclosureEngine {
  constructor(
    private graph: GraphService,
    private glossary: GlossaryService
  ) {}

  async evaluate(
    userText: string,
    activeNodeUuids: string[],
    namespace = ""
  ): Promise<DisclosureMatch[]> {
    const matches: DisclosureMatch[] = [];
    const seen = new Set<string>();

    for (const nodeUuid of activeNodeUuids) {
      const mem = await this.graph.getMemoryByNodeUuid(nodeUuid, namespace);
      if (!mem) continue;
      const disclosure = (mem['disclosure'] as string) || "";
      if (!disclosure) continue;

      const shouldDisclose = await this._checkRule(disclosure, userText, mem, namespace);
      if (shouldDisclose && !seen.has(nodeUuid)) {
        seen.add(nodeUuid);
        matches.push({
          node_uuid: nodeUuid,
          uri: ((mem['paths'] as string[])?.[0]) || `unknown://${nodeUuid}`,
          content: (mem['content'] as string) || "",
          reason: disclosure,
        });
      }
    }

    // Also check glossary auto-triggers
    const glossaryHits = await this.glossary.findGlossaryInContent(userText, namespace);
    for (const [, nodes] of glossaryHits) {
      for (const n of nodes) {
        if (seen.has(n.node_uuid)) continue;
        const mem = await this.graph.getMemoryByNodeUuid(n.node_uuid, namespace);
        if (mem) {
          seen.add(n.node_uuid);
          matches.push({
            node_uuid: n.node_uuid,
            uri: n.uri,
            content: (mem['content'] as string) || "",
            reason: `glossary keyword match`,
          });
        }
      }
    }

    return matches.slice(0, 5);
  }

  private async _checkRule(
    disclosure: string,
    userText: string,
    mem: Record<string, unknown>,
    _namespace: string
  ): Promise<boolean> {
    const text = disclosure.toLowerCase().trim();
    if (text === "always") return true;

    // keyword(auth, login)
    const kwMatch = text.match(/when:\s*keyword\s*\(([^)]+)\)/);
    if (kwMatch) {
      const keywords = kwMatch[1]!.split(",").map((k) => k.trim().toLowerCase());
      const userLower = userText.toLowerCase();
      return keywords.some((k) => userLower.includes(k));
    }

    // file(src/auth/*.ts)
    const fileMatch = text.match(/when:\s*file\s*\(([^)]+)\)/);
    if (fileMatch) {
      const pattern = fileMatch[1]!.trim();
      const paths = (mem['paths'] as string[]) || [];
      return paths.some((p) => this._matchGlob(p, pattern));
    }

    // topic(security)
    const topicMatch = text.match(/when:\s*topic\s*\(([^)]+)\)/);
    if (topicMatch) {
      const topic = topicMatch[1]!.trim().toLowerCase();
      const userLower = userText.toLowerCase();
      // Simple heuristic: check if topic word appears
      return userLower.includes(topic);
    }

    // Default: treat as plain keyword check
    return userText.toLowerCase().includes(text);
  }

  private _matchGlob(value: string, pattern: string): boolean {
    const regex = new RegExp(
      "^" + pattern.replace(/\*\*/g, "<<<DOUBLESTAR>>>").replace(/\*/g, "[^/]*").replace(/<<<DOUBLESTAR>>>/g, ".*") + "$"
    );
    return regex.test(value);
  }
}
