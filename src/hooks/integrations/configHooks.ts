/**
 * Config Hook Integration
 *
 * Emits ConfigChange events when settings are modified.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

export async function emitConfigChange(key: string, value: unknown): Promise<void> {
  const hookInput: HookInput = {
    event: "ConfigChange",
    config_key: key,
    config_value: value,
  };
  await executeHooksForEvent("ConfigChange", hookInput);
}
