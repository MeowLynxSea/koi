/**
 * Glossary Service for Cat's Context Engine.
 *
 * Manages keyword-to-node bindings and provides Aho-Corasick-based
 * content scanning for keyword highlighting.
 */

import type { DatabaseManager } from "../core/db.js";
import type { SearchIndexer } from "./search-indexer.js";

// Minimal Aho-Corasick implementation
class AhoCorasickNode {
  children = new Map<string, AhoCorasickNode>();
  fail: AhoCorasickNode | null = null;
  output: string[] = [];
}

class AhoCorasick {
  private root = new AhoCorasickNode();

  addWord(word: string): void {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new AhoCorasickNode());
      node = node.children.get(ch)!;
    }
    node.output.push(word);
  }

  build(): void {
    const queue: AhoCorasickNode[] = [];
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [ch, child] of current.children) {
        let fail = current.fail;
        while (fail && !fail.children.has(ch)) fail = fail.fail;
        child.fail = fail ? fail.children.get(ch)! : this.root;
        child.output.push(...child.fail.output);
        queue.push(child);
      }
    }
  }

  search(text: string): Set<string> {
    const found = new Set<string>();
    let node = this.root;
    for (const ch of text) {
      while (node && !node.children.has(ch)) node = node.fail!;
      if (!node) {
        node = this.root;
        continue;
      }
      node = node.children.get(ch)!;
      for (const word of node.output) found.add(word);
    }
    return found;
  }
}

export class GlossaryService {
  private automaton: AhoCorasick | null = null;
  private fingerprint: string | null = null;

  constructor(
    private db: DatabaseManager,
    private search: SearchIndexer
  ) {}

  async addGlossaryKeyword(keyword: string, nodeUuid: string, namespace = ""): Promise<Record<string, unknown>> {
    const kw = keyword.trim();
    if (!kw) throw new Error("Glossary keyword cannot be empty");

    const node = await this.db.fetchone<[number]>("SELECT 1 FROM nodes WHERE uuid = ?", [nodeUuid]);
    if (!node) throw new Error(`Node '${nodeUuid}' not found`);

    try {
      await this.db.execute(
        `INSERT INTO glossary_keywords (keyword, node_uuid, namespace) VALUES (?, ?, ?)`,
        [kw, nodeUuid, namespace]
      );
    } catch {
      throw new Error(`Keyword '${kw}' is already bound to this node`);
    }

    await this.search.refreshSearchDocumentsForNode(nodeUuid, namespace, true);
    return { keyword: kw, node_uuid: nodeUuid };
  }

  async removeGlossaryKeyword(keyword: string, nodeUuid: string, namespace = ""): Promise<Record<string, unknown>> {
    await this.db.execute(
      `DELETE FROM glossary_keywords WHERE keyword = ? AND node_uuid = ? AND namespace = ?`,
      [keyword.trim(), nodeUuid, namespace]
    );
    await this.search.refreshSearchDocumentsForNode(nodeUuid, namespace, true);
    return { success: true, keyword, node_uuid: nodeUuid };
  }

  async getGlossaryForNode(nodeUuid: string, namespace = ""): Promise<string[]> {
    const rows = await this.db.fetchall<[string]>(
      `SELECT keyword FROM glossary_keywords WHERE node_uuid = ? AND namespace = ? ORDER BY keyword`,
      [nodeUuid, namespace]
    );
    return rows.map((r) => r[0]);
  }

  async getAllGlossary(namespace = "", searchAllNamespaces = false): Promise<Array<Record<string, unknown>>> {
    const sql = searchAllNamespaces
      ? `SELECT g.keyword, g.node_uuid, g.namespace, p.domain, p.path, m.content
         FROM glossary_keywords g
         JOIN nodes n ON n.uuid = g.node_uuid
         LEFT JOIN edges e ON e.child_uuid = n.uuid
         LEFT JOIN paths p ON p.edge_id = e.id
         LEFT JOIN memories m ON m.node_uuid = n.uuid AND m.deprecated = 0
         ORDER BY g.keyword, p.domain, p.path`
      : `SELECT g.keyword, g.node_uuid, g.namespace, p.domain, p.path, m.content
         FROM glossary_keywords g
         JOIN nodes n ON n.uuid = g.node_uuid
         LEFT JOIN edges e ON e.child_uuid = n.uuid
         LEFT JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
         LEFT JOIN memories m ON m.node_uuid = n.uuid AND m.deprecated = 0
         WHERE g.namespace = ?
         ORDER BY g.keyword, p.domain, p.path`;
    const params = searchAllNamespaces ? [] : [namespace, namespace];
    const rows = await this.db.fetchall<[string, string, string, string | null, string | null, string | null]>(sql, params);

    const groups = new Map<string, Map<string, Record<string, unknown>>>();
    for (const [keyword, nodeUuid, ns, domain, pathStr, content] of rows) {
      if (!groups.has(keyword)) groups.set(keyword, new Map());
      const nodeMap = groups.get(keyword)!;
      const key = `${nodeUuid}_${ns}_${domain}_${pathStr}`;
      if (!nodeMap.has(key)) {
        const snippet = content ? (content.slice(0, 100).replace(/\n/g, " ") + (content.length > 100 ? "..." : "")) : "";
        const uri = domain && pathStr ? `${domain}://${pathStr}` : `unlinked://${nodeUuid}`;
        nodeMap.set(key, { node_uuid: nodeUuid, namespace: ns, uri, content_snippet: snippet });
      }
    }

    return Array.from(groups.entries()).map(([keyword, nodeMap]) => ({
      keyword,
      nodes: Array.from(nodeMap.values()),
    }));
  }

  async findGlossaryInContent(content: string, namespace = ""): Promise<Map<string, Array<{ node_uuid: string; uri: string }>>> {
    const fpRow = await this.db.fetchone<[number, number, string | null]>(
      `SELECT COUNT(*), COALESCE(MAX(id), 0), MAX(created_at) FROM glossary_keywords`
    );
    const currentFp = fpRow ? `${fpRow[0]}_${fpRow[1]}_${fpRow[2]}` : "0_0_null";

    if (currentFp !== this.fingerprint) {
      const kwRows = await this.db.fetchall<[string]>(`SELECT DISTINCT keyword FROM glossary_keywords`);
      const allKeywords = kwRows.map((r) => r[0]).filter(Boolean);
      if (allKeywords.length > 0) {
        this.automaton = new AhoCorasick();
        for (const kw of allKeywords) this.automaton.addWord(kw);
        this.automaton.build();
      } else {
        this.automaton = null;
      }
      this.fingerprint = currentFp;
    }

    if (!this.automaton) return new Map();

    const foundKeywords = this.automaton.search(content);
    if (foundKeywords.size === 0) return new Map();

    const placeholders = Array.from(foundKeywords).map(() => "?").join(",");
    const rows = await this.db.fetchall<[string, string, string | null, string | null]>(
      `SELECT g.keyword, g.node_uuid, p.domain, p.path
       FROM glossary_keywords g
       JOIN edges e ON e.child_uuid = g.node_uuid
       JOIN paths p ON p.edge_id = e.id AND p.namespace = ?
       WHERE g.keyword IN (${placeholders}) AND g.namespace = ?
       ORDER BY g.keyword, p.domain, p.path`,
      [namespace, ...Array.from(foundKeywords), namespace]
    );

    const matches = new Map<string, Map<string, string>>();
    for (const [keyword, nodeUuid, domain, pathStr] of rows) {
      if (!matches.has(keyword)) matches.set(keyword, new Map());
      const uri = domain && pathStr ? `${domain}://${pathStr}` : `unlinked://${nodeUuid}`;
      matches.get(keyword)!.set(nodeUuid, uri);
    }

    const result = new Map<string, Array<{ node_uuid: string; uri: string }>>();
    for (const [keyword, nodeMap] of matches) {
      result.set(
        keyword,
        Array.from(nodeMap.entries()).map(([nid, uri]) => ({ node_uuid: nid, uri }))
      );
    }
    return result;
  }
}
