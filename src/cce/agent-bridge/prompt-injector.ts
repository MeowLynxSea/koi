/**
 * Prompt Injector — Injects Working Memory + auto-disclosure into the system prompt.
 *
 * Hooked into the agent session lifecycle so every turn gets enriched context.
 */

import type { GraphService } from "../graph/graph-service.js";
import type { WorkingMemoryManager } from "../brain/working-memory.js";
import type { ActivationEngine } from "../brain/activation-engine.js";
import type { DisclosureEngine } from "./disclosure-engine.js";
import { getNamespaceContext } from "./namespace-context.js";

export class PromptInjector {
  constructor(
    _graph: GraphService,
    private wm: WorkingMemoryManager,
    private activation: ActivationEngine,
    private disclosure: DisclosureEngine
  ) {}

  async buildInjection(userText: string): Promise<string> {
    const namespace = getNamespaceContext().current;

    // 1. Process utterance → update WM
    const activated = await this.activation.computeActivations(userText, namespace, 50);
    await this.wm.updateFromActivations(namespace, activated, userText);

    // 2. Auto-trigger glossary keywords
    // (already handled by activation engine, but we can boost them)

    // 3. Evaluate disclosure rules
    const slotUuids = this.wm.getPool(namespace).slots.map((s) => s.node_uuid);
    const disclosures = await this.disclosure.evaluate(userText, slotUuids, namespace);

    // 4. Build injection text
    const lines: string[] = [];

    const wmText = this.wm.formatPool(namespace);
    if (wmText) {
      lines.push("<koi_context>", "", "=== Active Working Memory ===", "", wmText, "");
    }

    if (disclosures.length > 0) {
      lines.push("=== Auto-Disclosed Contexts ===", "");
      for (const d of disclosures) {
        lines.push(`[${d.uri}] reason: ${d.reason}`);
        const snippet = d.content.split("\n").slice(0, 5).join(" ").slice(0, 300);
        lines.push(snippet + (d.content.length > 300 ? "..." : ""));
        lines.push("");
      }
    }

    if (lines.length > 0) {
      lines.push("</koi_context>");
      return lines.join("\n");
    }

    return "";
  }
}
