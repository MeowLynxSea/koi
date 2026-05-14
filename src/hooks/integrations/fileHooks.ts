/**
 * File Hook Integration
 *
 * Emits FileChanged events when watched files change.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

export async function emitFileChanged(filePath: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "FileChanged",
    file_path: filePath,
    session_id: sessionId,
  };
  await executeHooksForEvent("FileChanged", hookInput, { sessionId });
}
