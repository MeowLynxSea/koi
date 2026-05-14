/**
 * Agent Tool — Spawn a subagent to perform a focused task.
 *
 * Implements Claude Code's AgentTool semantics on top of Pi's agent framework:
 *   • Built-in types: "explore" (read-only), "plan" (read-only + tasks)
 *   • Synchronous mode: wait for completion, return result text
 *   • Asynchronous mode: fire-and-forget, return agentId immediately
 *
 * Subagents are intentionally isolated:
 *   • Fresh message history (only the prompt)
 *   • Filtered tool set (no nested agents, no user questions, no plan-mode exit)
 *   • Max turn limit to prevent runaway token consumption
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ToolResultWithError } from "./types.js";
import { activeSessionRef } from "../agent/hooks.js";
import { runSubagent, type SubagentConfig } from "../agent/subagent.js";
import { subagentRegistry } from "../agent/subagent-registry.js";
import { emitSubagentStart, emitSubagentStop } from "../hooks/integrations/subagentHooks.js";

// ─── Schema ──────────────────────────────────────────────────────────────────

export const agentSchema = Type.Object({
  description: Type.String({
    description: "A short (3-5 word) description of the task",
    maxLength: 60,
  }),
  prompt: Type.String({
    description: "The complete task description for the subagent",
  }),
  subagent_type: Type.Optional(
    Type.Union(
      [Type.Literal("explore"), Type.Literal("plan")],
      { description: "Built-in agent type: 'explore' = read-only, 'plan' = planning mode. Defaults to 'explore' if omitted." }
    )
  ),
  model: Type.Optional(
    Type.String({
      description: "Model override (optional, not yet implemented)",
    })
  ),
  run_in_background: Type.Optional(
    Type.Boolean({
      description: "Run asynchronously in the background. A <task-notification> will be injected into your context when it completes. The user does not see this notification.",
    })
  ),
});

export type AgentToolInput = {
  description: string;
  prompt: string;
  subagent_type?: "explore" | "plan";
  model?: string;
  run_in_background?: boolean;
};

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function executeAgent(
  _toolCallId: string,
  params: AgentToolInput
): Promise<ToolResultWithError<{ result?: string; agentId?: string; status: string }>> {
  if (!activeSessionRef.current) {
    return {
      content: [{ type: "text", text: "Error: No active session available to spawn subagent." }],
      details: { status: "error" },
      isError: true,
    } as ToolResultWithError<{ result?: string; agentId?: string; status: string }>;
  }

  const config: SubagentConfig = {
    description: params.description,
    prompt: params.prompt,
    subagentType: params.subagent_type ?? "explore",
    runInBackground: params.run_in_background,
  };

  const sessionId = activeSessionRef.current?.sessionId;
  await emitSubagentStart(params.description, sessionId);

  if (params.run_in_background) {
    const agentId = await subagentRegistry.launch(sessionId || "", config);
    await emitSubagentStop(params.description, undefined, sessionId);
    return {
      content: [
        {
          type: "text",
          text: `Launched background agent ${agentId}: ${params.description}\n\nThe agent is running asynchronously. A <task-notification> will be injected into your context when it completes. The user does not see this notification.`,
        },
      ],
      details: { status: "async_launched", agentId },
    };
  }

  try {
    const result = await runSubagent(config);
    await emitSubagentStop(params.description, result, sessionId);
    return {
      content: [
        { type: "text", text: result || "[Agent completed with empty output]" },
      ],
      details: { status: "completed", result },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Subagent failed: ${message}` }],
      details: { status: "failed" },
      isError: true,
    } as ToolResultWithError<{ result?: string; agentId?: string; status: string }>;
  }
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export function createAgentToolDefinition(): ToolDefinition<
  typeof agentSchema,
  { result?: string; agentId?: string; status: string }
> {
  return {
    name: "agent",
    label: "Agent",
    description:
      "Spawn a focused subagent to perform a specific task in isolation.\n\n" +
      "Use this tool to delegate parallelizable work (e.g., exploring a directory, " +
      "researching a file, drafting a plan) while you continue with other tasks.\n\n" +
      "Built-in types:\n" +
      "  • explore — read-only tools only; safe for research and discovery (default)\n" +
      "  • plan    — read-only + task tools; for formulating implementation plans\n\n" +
      "If subagent_type is omitted, it defaults to 'explore' for safety.\n" +
      "Set run_in_background to true for fire-and-forget execution. " +
      "You will receive a <task-notification> when the background agent completes.",
    promptSnippet: "Agent: spawn a focused subagent to perform a task",
    promptGuidelines: [
      "Use Agent to delegate independent, parallelizable tasks.",
      "Provide a concise description (3-5 words) and a detailed prompt.",
      "Choose 'explore' for read-only research, 'plan' for drafting plans.",
      "Set run_in_background when you don't need the result immediately.",
      "Subagents cannot spawn other subagents or ask the user questions.",
    ],
    parameters: agentSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeAgent(toolCallId, params);
    },
  };
}
