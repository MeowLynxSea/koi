/**
 * Prompt Injector — Injects Working Memory + auto-disclosure into the system prompt.
 *
 * Hooked into the agent session lifecycle so every turn gets enriched context.
 *
 * Enhanced with:
 * - Cognitive sync reminders per turn
 * - Reflection triggers (periodic + corrective)
 * - Turn counter for reflective pacing
 * - Agent response post-processing (activations, episodes, associative reinforcement)
 */

import type { GraphService } from "../graph/graph-service.js";
import type { WorkingMemoryManager } from "../brain/working-memory.js";
import type { ActivationEngine } from "../brain/activation-engine.js";
import type { DisclosureEngine } from "./disclosure-engine.js";
import { getNamespaceContext } from "./namespace-context.js";

const REFLECTION_INTERVAL = 5;
const CORRECTION_KEYWORDS = [
  "不是这样",
  "你错了",
  "你搞错了",
  "不对",
  "错误",
  "incorrect",
  "wrong",
  "not right",
  "不对",
  "错了",
];

export interface InjectionResult {
  injection: string;
  inserted: string[];
  refreshed: string[];
  evicted: string[];
  rejected: string[];
}

export class PromptInjector {
  private turnCounters = new Map<string, number>();

  constructor(
    private graph: GraphService,
    private wm: WorkingMemoryManager,
    private activation: ActivationEngine,
    private disclosure: DisclosureEngine
  ) {}

  async buildInjection(userText: string): Promise<InjectionResult> {
    const namespace = getNamespaceContext().current;

    // 1. Process utterance → update WM (automatic framework behavior)
    const activated = await this.activation.computeActivations(userText, namespace, 50);
    const changes = await this.wm.updateFromActivations(namespace, activated, userText);

    // 2. Record episodes for top activated nodes
    if (changes.activated_nodes.length > 0) {
      const top = changes.activated_nodes.reduce((a, b) => ((a['score'] as number) > (b['score'] as number) ? a : b));
      try {
        await this.graph.recordEpisode(
          top['node_uuid'] as string,
          "conversation",
          top['uri'] as string,
          userText.slice(0, 500),
          this.wm.getPool(namespace).slots.map((s) => s.node_uuid),
          top['score'] as number
        );
      } catch {
        // ignore
      }
    }

    // 3. Auto-trigger glossary keywords
    // (already handled by activation engine, but we can boost them)

    // 4. Evaluate disclosure rules
    const slotUuids = this.wm.getPool(namespace).slots.map((s) => s.node_uuid);
    const disclosures = await this.disclosure.evaluate(userText, slotUuids, namespace);

    // 5. Turn-based reflection & cognitive sync
    const turnCount = (this.turnCounters.get(namespace) ?? 0) + 1;
    this.turnCounters.set(namespace, turnCount);

    const needsReflection = turnCount % REFLECTION_INTERVAL === 0;
    const isCorrective = CORRECTION_KEYWORDS.some((kw) => userText.toLowerCase().includes(kw.toLowerCase()));

    // 6. Build injection text
    const bodyLines: string[] = [];

    const wmText = this.wm.formatPool(namespace);
    if (wmText) {
      bodyLines.push("=== Active Working Memory ===", "", wmText, "");
    }

    if (disclosures.length > 0) {
      bodyLines.push("=== Auto-Disclosed Contexts ===", "");
      for (const d of disclosures) {
        bodyLines.push(`[${d.uri}] reason: ${d.reason}`);
        const snippet = d.content.split("\n").slice(0, 5).join(" ").slice(0, 300);
        bodyLines.push(snippet + (d.content.length > 300 ? "..." : ""));
        bodyLines.push("");
      }
    }

    // ─── Cognitive Sync Reminder ───
    bodyLines.push("=== Cognitive Sync ===");
    bodyLines.push("After code changes, update concept:// and memory:// nodes if architecture understanding changed.");
    bodyLines.push("If user corrects you, fix the relevant context node immediately—don't just apologize.");
    bodyLines.push("When you gain any durable insight, pattern, or assumption—WRITE IT DOWN immediately. commit_insight and write_context are cheap; losing context is expensive.");
    bodyLines.push("");

    // ─── Search & Memory Strategy ───
    bodyLines.push("=== Search & Memory Strategy ===");
    bodyLines.push("**Before using grep or glob**, try fuzzySearch first to find relevant code, concepts, or memories.");
    bodyLines.push("fuzzySearch understands natural language and searches your codebase + CCE graph simultaneously—faster and more context-aware than raw pattern matching.");
    bodyLines.push("");
    bodyLines.push("**Memory Discipline**: Read relevant context nodes before acting. Use fuzzySearch to locate concept:// or memory:// nodes, then read them with the file path provided.");
    bodyLines.push("After completing significant tasks, capture key insights: architecture decisions, patterns discovered, or unresolved questions.");
    bodyLines.push("");
    bodyLines.push("**Boot Memory**: Actively manage boot-linked memories (linked via manage_boot_links). Promote useful insights to boot, demote outdated ones. Strong boot memory means better context at session start.");
    bodyLines.push("");

    // ─── Reflection Prompt ───
    if (isCorrective) {
      bodyLines.push("=== Reflection Trigger (Corrective) ===");
      bodyLines.push("The user just corrected you. Pause and ask:");
      bodyLines.push("1. Which context node led to the wrong answer?");
      bodyLines.push("2. Is that node outdated, inaccurate, or missing key info?");
      bodyLines.push("3. Use fuzzySearch to locate the node, then write_context or commit_insight to fix it immediately.");
      bodyLines.push("");
    } else if (needsReflection) {
      bodyLines.push("=== Reflection Trigger (Periodic) ===");
      bodyLines.push("Take a moment to reflect:");
      bodyLines.push("1. Have any of your assumptions about this codebase shifted in the last few turns?");
      bodyLines.push("2. Is there a recurring pattern or insight worth capturing to memory:// or concept://?");
      bodyLines.push("3. Are any active Working Memory nodes stale or contradictory?");
      bodyLines.push("");
    }

    const injection = bodyLines.length > 0
      ? ["<koi_context>", "", ...bodyLines, "</koi_context>"].join("\n")
      : "";

    return {
      injection,
      inserted: changes.inserted,
      refreshed: changes.refreshed,
      evicted: changes.evicted,
      rejected: changes.rejected,
    };
  }

  /**
   * Post-process an agent response: compute activations, update WM, record episodes,
   * and reinforce associative edges between co-activated nodes.
   *
   * This should be called after the agent finishes a full response turn.
   */
  async processAgentResponse(agentText: string): Promise<void> {
    if (!agentText || agentText.trim().length === 0) return;
    const namespace = getNamespaceContext().current;

    // 1. Compute activations from agent's own output
    const activated = await this.activation.computeActivations(agentText, namespace, 50);

    // 2. Update WM (agent's discoveries enter working memory for next turn)
    const changes = await this.wm.updateFromActivations(namespace, activated, agentText);

    // 3. Record episodes for newly activated nodes
    for (const node of changes.activated_nodes) {
      try {
        await this.graph.recordEpisode(
          node['node_uuid'] as string,
          "agent_response",
          node['uri'] as string,
          agentText.slice(0, 500),
          this.wm.getPool(namespace).slots.map((s) => s.node_uuid),
          node['score'] as number
        );
      } catch {
        // ignore
      }
    }

    // 4. Reinforce associative edges between all co-activated nodes
    const activatedUuids = [
      ...new Set([
        ...this.wm.getPool(namespace).slots.map((s) => s.node_uuid),
        ...changes.activated_nodes.map((n) => n['node_uuid'] as string),
      ]),
    ];
    if (activatedUuids.length >= 2) {
      try {
        await this.graph.reinforceEdgesByCoactivation(activatedUuids, 0.03);
      } catch {
        // ignore
      }
    }
  }
}
