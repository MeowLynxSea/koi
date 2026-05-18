/**
 * Subagent Runner
 *
 * Creates a lightweight child Agent by directly instantiating pi-agent-core's Agent
 * class, copying the parent session's runtime config (streamFn, getApiKey, model,
 * systemPrompt) but with an isolated message history and filtered tool set.
 */

import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { UserMessage, AssistantMessage } from "@mariozechner/pi-ai";
import { activeSessionRef } from "./hooks.js";
import { getAuxiliaryModel, resolvePiModel } from "../config/settings.js";

export type SubagentType = "explore" | "plan";

export interface CustomAgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  maxTurns?: number;
  initialPrompt?: string;
}

export interface SubagentConfig {
  description: string;
  prompt: string;
  subagentType?: SubagentType;
  runInBackground?: boolean;
  maxTurns?: number;
  customAgent?: CustomAgentConfig;
}

const DEFAULT_MAX_TURNS = 50;

/** Tools that no subagent should ever see. */
const DISALLOWED_TOOLS = new Set([
  "agent",
  "askUserQuestion",
  "exitPlanMode",
]);

/** Read-only tool set for explore agents. */
const READONLY_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "webfetch",
  "taskGet",
  "taskList",
]);

/** Planning tool set for plan agents. */
const PLAN_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "webfetch",
  "taskGet",
  "taskList",
  "taskCreate",
  "taskUpdate",
  "enterPlanMode",
]);

function filterTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentTools: AgentTool<any>[],
  config: SubagentConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AgentTool<any>[] {
  const customAgent = config.customAgent;

  return parentTools.filter((tool) => {
    if (DISALLOWED_TOOLS.has(tool.name)) return false;

    // Custom agent tool filtering
    if (customAgent) {
      if (customAgent.disallowedTools?.includes(tool.name)) return false;
      if (customAgent.tools && !customAgent.tools.includes(tool.name)) return false;
      return true;
    }

    // Built-in type filtering
    let allowedNames: Set<string> | null = null;
    if (config.subagentType === "explore") {
      allowedNames = READONLY_TOOL_NAMES;
    } else if (config.subagentType === "plan") {
      allowedNames = PLAN_TOOL_NAMES;
    }

    if (allowedNames && !allowedNames.has(tool.name)) return false;
    return true;
  });
}

function buildSystemPrompt(
  parentSystemPrompt: string,
  config: SubagentConfig
): string {
  const customAgent = config.customAgent;
  if (customAgent) {
    return (
      parentSystemPrompt +
      "\n\n[CUSTOM AGENT: " +
      customAgent.name +
      "]\n" +
      customAgent.systemPrompt
    );
  }

  if (config.subagentType === "explore") {
    return (
      parentSystemPrompt +
      "\n\n[SUBAGENT MODE: Explore]\n" +
      "You are a read-only exploration subagent. " +
      "You cannot modify files or execute shell commands. " +
      "Your sole purpose is to gather information and report findings concisely."
    );
  }
  if (config.subagentType === "plan") {
    return (
      parentSystemPrompt +
      "\n\n[SUBAGENT MODE: Plan]\n" +
      "You are a planning subagent. " +
      "You can use read-only tools and task management tools to research and formulate plans. " +
      "You cannot modify files or execute shell commands. " +
      "Your output should be a detailed, actionable step-by-step plan."
    );
  }
  return parentSystemPrompt;
}

function extractResult(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg &&
      typeof msg === "object" &&
      "role" in msg &&
      msg.role === "assistant"
    ) {
      const assistant = msg as AssistantMessage;
      let text = "";
      for (const block of assistant.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }
      return text.trim() || "[Agent completed with no text output]";
    }
  }
  return "[Agent completed with no assistant message]";
}

/**
 * Run a subagent synchronously and return its final text output.
 *
 * @param onAgentCreated Optional callback invoked immediately after the Agent
 *   instance is created. Used by the async registry to hold a reference for
 *   abort/kill operations.
 */
export async function runSubagent(
  config: SubagentConfig,
  onAgentCreated?: (agent: Agent) => void
): Promise<string> {
  const parentSession = activeSessionRef.current;
  if (!parentSession) {
    throw new Error("No active session available to spawn subagent");
  }

  const parentAgent = parentSession.agent;
  const parentState = parentSession.state;

  const tools = filterTools(parentState.tools, config);
  const systemPrompt = buildSystemPrompt(parentState.systemPrompt, config);

  const userMessage: UserMessage = {
    role: "user",
    content: config.prompt,
    timestamp: Date.now(),
  };

  // Determine the model to use: prefer auxiliary model if configured
  let model = parentState.model;
  const auxiliaryRef = getAuxiliaryModel();
  if (auxiliaryRef) {
    const auxiliaryPiModel = resolvePiModel(auxiliaryRef);
    if (auxiliaryPiModel) {
      model = auxiliaryPiModel;
    }
  }

  const agent = new Agent({
    streamFn: parentAgent.streamFn,
    getApiKey: parentAgent.getApiKey,
    convertToLlm: parentAgent.convertToLlm,
    transformContext: parentAgent.transformContext,
    thinkingBudgets: parentAgent.thinkingBudgets,
    transport: parentAgent.transport,
    toolExecution: parentAgent.toolExecution,
    maxRetryDelayMs: parentAgent.maxRetryDelayMs,
    initialState: {
      systemPrompt,
      model,
      thinkingLevel: parentState.thinkingLevel,
      tools,
    },
  });

  onAgentCreated?.(agent);

  let turnCount = 0;
  const maxTurns = config.maxTurns ?? config.customAgent?.maxTurns ?? DEFAULT_MAX_TURNS;
  const unsubscribe = agent.subscribe((event, _signal) => {
    if (event.type === "turn_start") {
      turnCount++;
      if (turnCount > maxTurns) {
        agent.abort();
      }
    }
  });

  try {
    await agent.prompt(userMessage);
    await agent.waitForIdle();
    return extractResult(agent.state.messages);
  } finally {
    unsubscribe();
  }
}
