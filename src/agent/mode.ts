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
