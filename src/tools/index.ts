/**
 * Koi Custom Tool Registry
 *
 * Re-implements Pi's built-in tools with custom orchestration and permission checks.
 * All tools are registered via createAgentSession({ customTools, noTools: 'builtin' }).
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { SessionTaskManager } from "../agent/session-tasks.js";
import { createReadToolDefinition } from "./read.js";
import { createGrepToolDefinition } from "./grep.js";
import { createGlobToolDefinition } from "./glob.js";
import { createLsToolDefinition } from "./ls.js";
import { createBashToolDefinition } from "./bash.js";
import { createEditToolDefinition } from "./edit.js";
import { createWriteToolDefinition } from "./write.js";
import { createWebFetchToolDefinition } from "./webfetch.js";
import {
  createTaskCreateToolDefinition,
  createTaskGetToolDefinition,
  createTaskListToolDefinition,
  createTaskUpdateToolDefinition,
} from "./task.js";

export function createCodingToolDefinitions(
  cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition<any, any, any>[] {
  return [
    createReadToolDefinition(cwd),
    createGrepToolDefinition(cwd),
    createGlobToolDefinition(cwd),
    createLsToolDefinition(cwd),
    createBashToolDefinition(cwd),
    createEditToolDefinition(cwd),
    createWriteToolDefinition(cwd),
    createWebFetchToolDefinition(cwd),
    createTaskCreateToolDefinition(cwd, taskManager),
    createTaskGetToolDefinition(cwd, taskManager),
    createTaskListToolDefinition(cwd, taskManager),
    createTaskUpdateToolDefinition(cwd, taskManager),
  ];
}

export function createReadOnlyToolDefinitions(cwd: string): ToolDefinition<any, any, any>[] {
  return [
    createReadToolDefinition(cwd),
    createGrepToolDefinition(cwd),
    createGlobToolDefinition(cwd),
    createLsToolDefinition(cwd),
    createWebFetchToolDefinition(cwd),
  ];
}

export * from "./types.js";
