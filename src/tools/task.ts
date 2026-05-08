/**
 * Task Management Tools — Session-scoped task tracking with persistence
 *
 * Implements Claude Code's 4-tool task system:
 *   TaskCreate  → create a new task
 *   TaskGet     → retrieve a single task by ID
 *   TaskList    → list all tasks (optionally filtered by status)
 *   TaskUpdate  → update task fields, status, and dependency relationships
 *
 * Tasks are now isolated per session via SessionTaskManager and persisted
 * to ~/.config/koi/sessions/<sessionId>/tasks.json.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";
import type { SessionTaskManager, Task } from "../agent/session-tasks.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const taskCreateSchema = Type.Object({
  content: Type.String({ description: "Task description / content" }),
  priority: Type.Optional(
    Type.Union(
      [Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")],
      { description: "Task priority (default: medium)" }
    )
  ),
  blockedBy: Type.Optional(
    Type.Array(Type.String({ description: "Task ID that blocks this task" }), {
      description: "IDs of tasks that must be completed before this one can start",
    })
  ),
  blocks: Type.Optional(
    Type.Array(Type.String({ description: "Task ID that this task blocks" }), {
      description: "IDs of tasks that are blocked until this one is completed",
    })
  ),
});

export type TaskCreateInput = {
  content: string;
  priority?: "high" | "medium" | "low";
  blockedBy?: string[];
  blocks?: string[];
};

export const taskGetSchema = Type.Object({
  taskId: Type.String({ description: "Unique task identifier" }),
});

export type TaskGetInput = {
  taskId: string;
};

export const taskListSchema = Type.Object({
  status: Type.Optional(
    Type.Union(
      [Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")],
      { description: "Filter by status" }
    )
  ),
});

export type TaskListInput = {
  status?: "pending" | "in_progress" | "completed";
};

export const taskUpdateSchema = Type.Object({
  taskId: Type.String({ description: "Unique task identifier" }),
  content: Type.Optional(Type.String({ description: "New task description" })),
  status: Type.Optional(
    Type.Union(
      [Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed")],
      { description: "New task status" }
    )
  ),
  priority: Type.Optional(
    Type.Union(
      [Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")],
      { description: "New task priority" }
    )
  ),
  addBlockedBy: Type.Optional(
    Type.Array(Type.String(), { description: "Task IDs to add to blockedBy" })
  ),
  removeBlockedBy: Type.Optional(
    Type.Array(Type.String(), { description: "Task IDs to remove from blockedBy" })
  ),
  addBlocks: Type.Optional(
    Type.Array(Type.String(), { description: "Task IDs to add to blocks" })
  ),
  removeBlocks: Type.Optional(
    Type.Array(Type.String(), { description: "Task IDs to remove from blocks" })
  ),
});

export type TaskUpdateInput = {
  taskId: string;
  content?: string;
  status?: "pending" | "in_progress" | "completed";
  priority?: "high" | "medium" | "low";
  addBlockedBy?: string[];
  removeBlockedBy?: string[];
  addBlocks?: string[];
  removeBlocks?: string[];
};

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatTaskList(taskArray: Task[]): string {
  if (taskArray.length === 0) return "No tasks found.";

  const lines: string[] = [];
  for (const t of taskArray) {
    const depInfo: string[] = [];
    if (t.blockedBy.length > 0) depInfo.push(`blockedBy:[${t.blockedBy.join(", ")}]`);
    if (t.blocks.length > 0) depInfo.push(`blocks:[${t.blocks.join(", ")}]`);
    const depStr = depInfo.length > 0 ? ` {${depInfo.join(", ")}}` : "";
    lines.push(`- [${t.status}] ${t.id} (${t.priority}): ${t.content}${depStr}`);
  }
  return lines.join("\n");
}

// ─── Execute Functions (injected with SessionTaskManager) ────────────────────

export async function executeTaskCreate(
  taskManager: SessionTaskManager,
  _toolCallId: string,
  params: TaskCreateInput
): Promise<{ content: TextContent[]; details: { task: Task } }> {
  const task = taskManager.createTask(
    params.content,
    params.priority ?? "medium",
    params.blockedBy,
    params.blocks
  );

  return {
    content: [{ type: "text", text: `Created task ${task.id}: ${task.content}` }],
    details: { task },
  };
}

export async function executeTaskGet(
  taskManager: SessionTaskManager,
  _toolCallId: string,
  params: TaskGetInput
): Promise<{ content: TextContent[]; details: { task: Task | null } }> {
  const task = taskManager.getTask(params.taskId);

  if (!task) {
    return {
      content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
      details: { task: null },
      isError: true,
    } as any;
  }

  const lines = [
    `id: ${task.id}`,
    `content: ${task.content}`,
    `status: ${task.status}`,
    `priority: ${task.priority}`,
    `blockedBy: [${task.blockedBy.join(", ") || "none"}]`,
    `blocks: [${task.blocks.join(", ") || "none"}]`,
  ];

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { task },
  };
}

export async function executeTaskList(
  taskManager: SessionTaskManager,
  _toolCallId: string,
  params: TaskListInput
): Promise<{ content: TextContent[]; details: { tasks: Task[]; count: number } }> {
  const all = taskManager.listTasks(params.status);
  const text = formatTaskList(all);

  return {
    content: [{ type: "text", text }],
    details: { tasks: all, count: all.length },
  };
}

export async function executeTaskUpdate(
  taskManager: SessionTaskManager,
  _toolCallId: string,
  params: TaskUpdateInput
): Promise<{ content: TextContent[]; details: { task: Task | null } }> {
  const task = taskManager.updateTask(params.taskId, {
    content: params.content,
    status: params.status,
    priority: params.priority,
    addBlockedBy: params.addBlockedBy,
    removeBlockedBy: params.removeBlockedBy,
    addBlocks: params.addBlocks,
    removeBlocks: params.removeBlocks,
  });

  if (!task) {
    return {
      content: [{ type: "text", text: `Task not found: ${params.taskId}` }],
      details: { task: null },
      isError: true,
    } as any;
  }

  return {
    content: [{ type: "text", text: `Updated task ${task.id}: ${task.content} [${task.status}]` }],
    details: { task },
  };
}

// ─── Tool Definition Factories ───────────────────────────────────────────────

export function createTaskCreateToolDefinition(
  _cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition<typeof taskCreateSchema, { task: Task }> {
  return {
    name: "taskCreate",
    label: "TaskCreate",
    description:
      "Create a new task in the session todo list.\n\n" +
      "Use VERY frequently to break down complex tasks into atomic steps. " +
      "ALWAYS create a todo list before starting multi-step work. " +
      "If you do not use this tool when planning, you may forget important tasks.",
    promptSnippet: "TaskCreate: create a new task in the session todo list",
    promptGuidelines: [
      "Use TaskCreate VERY frequently to track and plan tasks.",
      "ALWAYS create a todo list before starting multi-step or non-trivial work.",
      "Break large complex tasks into smaller atomic steps.",
      "Set priority to 'high' for critical path items, 'low' for nice-to-haves.",
      "Use blockedBy/blocks to express dependency relationships between tasks.",
    ],
    parameters: taskCreateSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeTaskCreate(taskManager, toolCallId, params);
    },
  };
}

export function createTaskGetToolDefinition(
  _cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition<typeof taskGetSchema, { task: Task | null }> {
  return {
    name: "taskGet",
    label: "TaskGet",
    description: "Retrieve the full details of a single task by its ID.",
    promptSnippet: "TaskGet: retrieve details of a specific task by ID",
    promptGuidelines: [
      "Use TaskGet when you need to inspect a task's dependencies or full state.",
    ],
    parameters: taskGetSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeTaskGet(taskManager, toolCallId, params);
    },
  };
}

export function createTaskListToolDefinition(
  _cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition<typeof taskListSchema, { tasks: Task[]; count: number }> {
  return {
    name: "taskList",
    label: "TaskList",
    description:
      "List all tasks in the session todo list, optionally filtered by status.\n\n" +
      "Check your progress regularly — at the start of each turn, after completing a step, " +
      "and whenever you're unsure what to do next.",
    promptSnippet: "TaskList: list all tasks (optionally filter by status)",
    promptGuidelines: [
      "Call TaskList at the start of each conversation turn to review progress.",
      "Call TaskList after completing any task to verify next steps.",
      "Call TaskList whenever you are unsure what to do next.",
    ],
    parameters: taskListSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeTaskList(taskManager, toolCallId, params);
    },
  };
}

export function createTaskUpdateToolDefinition(
  _cwd: string,
  taskManager: SessionTaskManager
): ToolDefinition<typeof taskUpdateSchema, { task: Task | null }> {
  return {
    name: "taskUpdate",
    label: "TaskUpdate",
    description:
      "Update an existing task's content, status, priority, or dependency relationships.\n\n" +
      "Mark tasks as 'in_progress' BEFORE starting work on them. " +
      "ONLY mark as 'completed' when FULLY done — tests passing, no errors, no partial implementations. " +
      "If you encountered unresolved errors, do NOT mark the task as completed.",
    promptSnippet: "TaskUpdate: update task status, content, priority, or dependencies",
    promptGuidelines: [
      "Mark a task as 'in_progress' before you begin working on it.",
      "ONLY mark a task as 'completed' when you have FULLY accomplished it.",
      "Never mark completed if: tests are failing, implementation is partial, unresolved errors exist.",
      "Ideally you should only have one task as 'in_progress' at a time (single-threaded focus).",
      "Update blockedBy / blocks to reflect changing dependency relationships.",
    ],
    parameters: taskUpdateSchema,
    executionMode: "parallel",
    async execute(toolCallId, params, _signal, _onUpdate) {
      return executeTaskUpdate(taskManager, toolCallId, params);
    },
  };
}
