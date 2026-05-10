/**
 * Koi Custom Tool Registry
 *
 * Re-implements Pi's built-in tools with custom orchestration and permission checks.
 * All tools are registered via createAgentSession({ customTools, noTools: 'builtin' }).
 */

import type { SessionTaskManager } from "../agent/session-tasks.js";
import { createReadToolDefinition } from "./read.js";
import { createGrepToolDefinition } from "./grep.js";
import { createGlobToolDefinition } from "./glob.js";
import { createLsToolDefinition } from "./ls.js";
import { createBashToolDefinition } from "./bash.js";
import { createEditToolDefinition } from "./edit.js";
import { createWriteToolDefinition } from "./write.js";
import { createWebFetchToolDefinition } from "./webfetch.js";
import { createAskUserQuestionToolDefinition } from "./ask-user-question.js";
import {
  createEnterPlanModeToolDefinition,
  createExitPlanModeToolDefinition,
} from "./plan-mode.js";
import { createAgentToolDefinition } from "./agent.js";
import {
  createTaskCreateToolDefinition,
  createTaskGetToolDefinition,
  createTaskListToolDefinition,
  createTaskUpdateToolDefinition,
} from "./task.js";
import {
  createMonitorToolDefinition,
  createCancelMonitorToolDefinition,
} from "./monitor.js";
import { createSendToMonitorToolDefinition } from "./send-to-monitor.js";
import { createSkillToolDefinition } from "./skill.js";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

export function createCodingToolDefinitions(
  _cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition[] {
  return [
    createReadToolDefinition(_cwd),
    createGrepToolDefinition(_cwd),
    createGlobToolDefinition(_cwd),
    createLsToolDefinition(_cwd),
    createBashToolDefinition(_cwd),
    createEditToolDefinition(_cwd),
    createWriteToolDefinition(_cwd),
    createWebFetchToolDefinition(_cwd),
    createAskUserQuestionToolDefinition(),
    createEnterPlanModeToolDefinition(),
    createExitPlanModeToolDefinition(),
    createAgentToolDefinition(),
    createTaskCreateToolDefinition(_cwd, taskManager),
    createTaskGetToolDefinition(_cwd, taskManager),
    createTaskListToolDefinition(_cwd, taskManager),
    createTaskUpdateToolDefinition(_cwd, taskManager),
    createMonitorToolDefinition(),
    createCancelMonitorToolDefinition(),
    createSendToMonitorToolDefinition(),
    createSkillToolDefinition(),
  ] as ToolDefinition[];
}

export function createReadOnlyToolDefinitions(_cwd: string): ToolDefinition[] {
  return [
    createReadToolDefinition(_cwd),
    createGrepToolDefinition(_cwd),
    createGlobToolDefinition(_cwd),
    createLsToolDefinition(_cwd),
    createWebFetchToolDefinition(_cwd),
  ] as ToolDefinition[];
}

export * from "./types.js";
