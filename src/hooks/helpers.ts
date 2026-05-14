/**
 * Hook Helpers
 *
 * Output parsing, JSON processing, and env var interpolation.
 */

import type { HookCommand, HookResult, HookJSONOutput } from "./types.js";

/**
 * Parse raw stdout from a command hook into JSON output.
 */
export function parseHookOutput(stdout: string): HookJSONOutput {
  const trimmed = stdout.trim();
  if (!trimmed) return { continue: true };

  try {
    return JSON.parse(trimmed) as HookJSONOutput;
  } catch {
    return { continue: true, systemMessage: trimmed };
  }
}

/**
 * Process a HookJSONOutput into a HookResult.
 */
export function processHookJSONOutput(
  output: HookJSONOutput,
  hook: HookCommand
): HookResult {
  const continueExecution = output.continue ?? true;
  const specific = output.hookSpecificOutput || {};

  return {
    outcome: continueExecution ? "success" : "blocking",
    preventContinuation: !continueExecution,
    stopReason: output.stopReason,
    systemMessage: output.systemMessage,
    permissionBehavior: specific.permissionDecision,
    additionalContext: specific.additionalContext,
    updatedInput: specific.updatedInput,
    retry: specific.retry,
    hook,
  };
}

/**
 * Interpolate environment variables in a string.
 * Supports ${VAR} and $VAR syntax.
 */
export function interpolateEnvVars(
  value: string,
  allowedVars?: Set<string>
): string {
  return value
    .replace(/\$\{(\w+)\}/g, (_match, varName) => {
      if (allowedVars && !allowedVars.has(varName)) return "";
      return process.env[varName] || "";
    })
    .replace(/\$(\w+)/g, (_match, varName) => {
      if (allowedVars && !allowedVars.has(varName)) return "";
      return process.env[varName] || "";
    });
}

/**
 * Validate that a file path stays within a base directory.
 * Prevents path traversal attacks.
 */
export function validatePathWithinBase(
  filePath: string,
  baseDir: string
): boolean {
  const resolved = require("path").resolve(filePath);
  const resolvedBase = require("path").resolve(baseDir);
  return resolved.startsWith(resolvedBase + require("path").sep) || resolved === resolvedBase;
}
