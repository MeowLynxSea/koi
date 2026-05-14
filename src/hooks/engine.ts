/**
 * Hook Execution Engine
 *
 * The core orchestrator for running hooks across all events.
 * Collects matching hooks, executes them, and aggregates results.
 */

import type {
  HookEvent,
  HookInput,
  HookCommand,
  PluginHookMatcher,
  HookResult,
  AggregatedHookResult,
  HookJSONOutput,
  RegisteredCallbackHook,
} from "./types.js";
import { collectHooksForEvent } from "./registry.js";
import { executeCommandHook } from "./execCommand.js";
import { executePromptHook } from "./execPrompt.js";
import { executeAgentHook } from "./execAgent.js";
import { executeHttpHook } from "./execHttp.js";
import { executeFunctionHook } from "./execFunction.js";
import { processHookJSONOutput } from "./helpers.js";
import { isPluginTrusted } from "../plugins/trust.js";

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute all matching hooks for a given event.
 */
export async function executeHooksForEvent(
  event: HookEvent,
  input: HookInput,
  options?: {
    sessionId?: string;
    matcherFilter?: string;
    skipAsync?: boolean;
  }
): Promise<AggregatedHookResult> {
  const { sessionId, matcherFilter } = options || {};

  const collected = collectHooksForEvent(event, matcherFilter);
  const results: HookResult[] = [];

  // Execute settings hooks
  for (const matcher of collected.settingsMatchers) {
    for (const hook of matcher.hooks) {
      if (shouldSkipHook(hook, input)) continue;
      const result = await executeSingleHook(hook, input, event);
      results.push(result);
      if (result.preventContinuation && !isAsyncHook(hook)) {
        break;
      }
    }
  }

  // Execute plugin hooks
  for (const matcher of collected.pluginMatchers) {
    // Skip untrusted plugins
    if (!isPluginTrusted(matcher.pluginName)) continue;
    for (const hook of matcher.hooks) {
      if (shouldSkipHook(hook, input)) continue;
      const enrichedInput = enrichInputForPlugin(input, matcher);
      const result = await executeSingleHook(hook, enrichedInput, event, matcher);
      results.push(result);
      if (result.preventContinuation && !isAsyncHook(hook)) {
        break;
      }
    }
  }

  // Execute session hooks
  const sessionMatchers = sessionId
    ? collected.sessionMatchers
    : collected.sessionMatchers;
  for (const matcher of sessionMatchers) {
    for (const hook of matcher.hooks) {
      if (shouldSkipHook(hook, input)) continue;
      const result = await executeSingleHook(hook, input, event);
      results.push(result);
      if (result.preventContinuation && !isAsyncHook(hook)) {
        break;
      }
    }
  }

  // Execute callback hooks
  for (const cb of collected.callbacks) {
    const result = await executeCallbackHook(cb, input, event);
    results.push(result);
    if (result.preventContinuation) {
      break;
    }
  }

  return aggregateResults(results);
}

// ============================================================================
// Single Hook Execution
// ============================================================================

async function executeSingleHook(
  hook: HookCommand,
  input: HookInput,
  _event: HookEvent,
  pluginMatcher?: PluginHookMatcher
): Promise<HookResult> {
  const startTime = Date.now();
  const timeout = hook.timeout || 60000;

  try {
    let output: HookJSONOutput;

    switch (hook.type) {
      case "command":
        output = await executeCommandHook(hook, input, {
          timeout,
          pluginRoot: pluginMatcher?.pluginRoot,
        });
        break;
      case "prompt":
        output = await executePromptHook(hook, input, { timeout });
        break;
      case "agent":
        output = await executeAgentHook(hook, input, { timeout });
        break;
      case "http":
        output = await executeHttpHook(hook, input, { timeout });
        break;
      case "function":
        output = await executeFunctionHook(hook, input);
        break;
      default:
        return {
          outcome: "non_blocking_error",
          message: `Unknown hook type: ${(hook as HookCommand).type}`,
          hook,
        };
    }

    return processHookJSONOutput(output, hook);
  } catch (e) {
    const elapsed = Date.now() - startTime;
    return {
      outcome: elapsed >= timeout ? "blocking" : "non_blocking_error",
      message: e instanceof Error ? e.message : String(e),
      hook,
    };
  }
}

async function executeCallbackHook(
  cb: RegisteredCallbackHook,
  input: HookInput,
  _event: HookEvent
): Promise<HookResult> {
  try {
    const result = await cb.callback(input);
    if (typeof result === "boolean") {
      return {
        outcome: "success",
        preventContinuation: !result,
        hook: { type: "function", fn: cb.callback } as HookCommand,
      };
    }
    return processHookJSONOutput(result, { type: "function", fn: cb.callback } as HookCommand);
  } catch (e) {
    return {
      outcome: "non_blocking_error",
      message: e instanceof Error ? e.message : String(e),
      hook: { type: "function", fn: cb.callback } as HookCommand,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function shouldSkipHook(hook: HookCommand, input: HookInput): boolean {
  // Evaluate `if` condition using permission rule syntax
  if (hook.if) {
    const condition = hook.if;
    const toolName = input.tool_name || "";
    const toolInput = JSON.stringify(input.tool_input || {});
      // Simple pattern matching: "Bash(git *)" matches tool_name="Bash" and args containing "git"
    const match = condition.match(/^([A-Za-z]+)\((.*)\)$/);
    if (match && match[1] && match[2]) {
      const expectedTool = match[1];
      const expectedPattern = match[2].replace(/\*/g, ".*");
      if (toolName !== expectedTool) return true;
      const regex = new RegExp(expectedPattern);
      if (!regex.test(toolInput)) return true;
    }
  }
  return false;
}

function isAsyncHook(hook: HookCommand): boolean {
  return hook.type === "command" && (!!hook.async || !!hook.asyncRewake);
}

function enrichInputForPlugin(
  input: HookInput,
  matcher: PluginHookMatcher
): HookInput {
  return {
    ...input,
    plugin_root: matcher.pluginRoot,
    plugin_name: matcher.pluginName,
    plugin_id: matcher.pluginId,
  };
}

function aggregateResults(results: HookResult[]): AggregatedHookResult {
  const aggregated: AggregatedHookResult = {
    outcomes: [],
    preventContinuation: false,
    systemMessages: [],
    errors: [],
  };

  for (const result of results) {
    aggregated.outcomes.push(result.outcome);

    if (result.preventContinuation || result.outcome === "blocking") {
      aggregated.preventContinuation = true;
    }
    if (result.stopReason) {
      aggregated.stopReason = result.stopReason;
    }
    if (result.systemMessage) {
      aggregated.systemMessages.push(result.systemMessage);
    }
    if (result.permissionBehavior) {
      aggregated.permissionBehavior = result.permissionBehavior;
    }
    if (result.additionalContext) {
      aggregated.additionalContext = aggregated.additionalContext
        ? `${aggregated.additionalContext}\n${result.additionalContext}`
        : result.additionalContext;
    }
    if (result.updatedInput) {
      aggregated.updatedInput = { ...aggregated.updatedInput, ...result.updatedInput };
    }
    if (result.retry !== undefined) {
      aggregated.retry = result.retry;
    }
    if (result.message) {
      aggregated.errors.push(result.message);
    }
  }

  return aggregated;
}
