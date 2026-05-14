/**
 * Function Hook Executor
 *
 * Invokes an in-memory TypeScript callback.
 */

import type { FunctionHook, HookInput, HookJSONOutput } from "./types.js";

export async function executeFunctionHook(
  hook: FunctionHook,
  input: HookInput
): Promise<HookJSONOutput> {
  const result = await hook.fn(input);
  return result;
}
