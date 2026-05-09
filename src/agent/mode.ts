/**
 * Agent Mode Manager
 *
 * Manages the three agent operating modes:
 *   • build — full tool access (default)
 *   • ask   — read-only tools only
 *   • plan  — no write/edit/bash tools; planning tools allowed
 *
 * Also provides the active tool name allowlist for each mode,
 * used with AgentSession.setActiveToolsByName().
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";

export type AgentMode = "build" | "ask" | "plan";

let currentMode: AgentMode = "build";
let listeners: (() => void)[] = [];

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribeModeChanges(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getAgentMode(): AgentMode {
  return currentMode;
}

export function setAgentMode(mode: AgentMode): void {
  if (currentMode === mode) return;
  currentMode = mode;
  emit();
}

export function cycleAgentMode(): AgentMode {
  const order: AgentMode[] = ["build", "ask", "plan"];
  const idx = order.indexOf(currentMode);
  const next = order[(idx + 1) % order.length] ?? "build";
  currentMode = next;
  emit();
  return next;
}

/**
 * Inject mode awareness into the session's system prompt.
 * Patches _baseSystemPrompt directly because Pi resets systemPrompt from it on every turn.
 */
export function injectModeIntoSystemPrompt(session: AgentSession, mode: AgentMode): void {
  const modeNotice =
    mode === "plan"
      ? "\n\n[AGENT MODE: Plan Mode. Write/edit/bash tools are DISABLED. You must NOT modify any files. Your task is to research, analyze, and formulate a detailed step-by-step plan. Use read-only tools to gather information. Once your plan is ready, you MUST call exitPlanMode with the complete plan to return to Build Mode.]"
      : mode === "ask"
        ? "\n\n[AGENT MODE: Ask Mode. Only read-only tools are available. You cannot modify files or execute commands.]"
        : "\n\n[AGENT MODE: Build Mode. All tools are available.]";

  const basePrompt = (session as unknown as Record<string, string>)["_baseSystemPrompt"] ?? "";
  const modePattern = /\n\n\[AGENT MODE:.*?\]/s;
  const cleanPrompt = basePrompt.replace(modePattern, "");
  const patchedPrompt = cleanPrompt + modeNotice;
  (session as unknown as Record<string, string>)["_baseSystemPrompt"] = patchedPrompt;
  session.state.systemPrompt = patchedPrompt;
}



const ALL_TOOLS = [
  "read",
  "grep",
  "glob",
  "ls",
  "bash",
  "edit",
  "write",
  "webfetch",
  "taskCreate",
  "taskGet",
  "taskList",
  "taskUpdate",
  "askUserQuestion",
  "enterPlanMode",
  "exitPlanMode",
  "agent",
];

const READONLY_TOOLS = [
  "read",
  "grep",
  "glob",
  "ls",
  "webfetch",
  "taskGet",
  "taskList",
];

const PLAN_TOOLS = [
  "read",
  "grep",
  "glob",
  "ls",
  "webfetch",
  "taskGet",
  "taskList",
  "taskCreate",
  "taskUpdate",
  "askUserQuestion",
  "enterPlanMode",
  "exitPlanMode",
];

export function getActiveToolNamesForMode(mode: AgentMode): string[] {
  switch (mode) {
    case "build":
      // Build mode can enter plan mode, but exitPlanMode is only for plan mode
      return ALL_TOOLS.filter((t) => t !== "exitPlanMode");
    case "ask":
      return READONLY_TOOLS;
    case "plan":
      // Plan mode can exit plan mode, but enterPlanMode is redundant while already in plan mode
      return PLAN_TOOLS.filter((t) => t !== "enterPlanMode");
    default:
      return ALL_TOOLS.filter((t) => t !== "exitPlanMode");
  }
}
