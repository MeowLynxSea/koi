/**
 * Config Hook Integration
 *
 * Emits ConfigChange events when settings are modified.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";

export async function emitConfigChange(key: string, value: unknown): Promise<void> {
  const hookInput: HookInput = {
    event: "ConfigChange",
    config_key: key,
    config_value: value,
  };
  const result = await executeHooksForEvent("ConfigChange", hookInput);
  forwardHookResult(result, "ConfigChange");
}
