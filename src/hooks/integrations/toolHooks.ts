/**
 * Tool Hook Integration
 *
 * Wraps every tool's execute() function to emit PreToolUse, PostToolUse,
 * and PostToolUseFailure events.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

/**
 * Wrap a tool definition with hook interception.
 */
export function wrapToolWithHooks(tool: ToolDefinition): ToolDefinition {
  const originalExecute = tool.execute;

  return {
    ...tool,
    execute: (async (...execArgs: unknown[]) => {
      const toolName = tool.name;
      const params = execArgs[1] as Record<string, unknown>;
      const hookInput: HookInput = {
        event: "PreToolUse",
        tool_name: toolName,
        tool_input: params,
      };

      // PreToolUse hook
      const preResult = await executeHooksForEvent("PreToolUse", hookInput, {
        matcherFilter: toolName,
      });

      if (preResult.preventContinuation) {
        const reason = preResult.stopReason || "Blocked by PreToolUse hook";
        throw new Error(reason);
      }

      // Allow hooks to modify input
      if (preResult.updatedInput) {
        execArgs[1] = { ...params, ...preResult.updatedInput };
      }

      try {
        const result = await (originalExecute as (...args: unknown[]) => Promise<unknown>)(...execArgs);

        // PostToolUse hook
        const postInput: HookInput = {
          event: "PostToolUse",
          tool_name: toolName,
          tool_input: execArgs[1] as Record<string, unknown>,
          tool_output: result,
        };
        await executeHooksForEvent("PostToolUse", postInput, {
          matcherFilter: toolName,
        });

        return result;
      } catch (error) {
        // PostToolUseFailure hook
        const failureInput: HookInput = {
          event: "PostToolUseFailure",
          tool_name: toolName,
          tool_input: execArgs[1] as Record<string, unknown>,
          tool_error: error instanceof Error ? error.message : String(error),
        };
        const failureResult = await executeHooksForEvent("PostToolUseFailure", failureInput, {
          matcherFilter: toolName,
        });

        if (failureResult.retry) {
          // Retry once
          return await (originalExecute as (...args: unknown[]) => Promise<unknown>)(...execArgs);
        }

        throw error;
      }
    }) as ToolDefinition["execute"],
  };
}

/**
 * Wrap all tools in a list with hook interception.
 */
export function wrapToolsWithHooks(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map(wrapToolWithHooks);
}
