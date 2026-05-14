/**
 * File Hook Integration
 *
 * Emits FileChanged events when watched files change.
 * Also triggers automatic reload of project configuration based on the changed file path.
 */

import path from "path";
import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";
import { forwardHookResult } from "../messageSink.js";
import { invalidatePluginSettingsCache } from "../../plugins/settings.js";
import { refreshActivePlugins } from "../../plugins/refresh.js";
import { refreshAgentDefinitions } from "../../plugins/loadAgents.js";
import { loadAllSkills } from "../../skills/loader.js";

export async function emitFileChanged(filePath: string, sessionId?: string): Promise<void> {
  const hookInput: HookInput = {
    event: "FileChanged",
    file_path: filePath,
    session_id: sessionId,
  };

  // Automatic reload based on file path
  await autoReloadForPath(filePath);

  const result = await executeHooksForEvent("FileChanged", hookInput, { sessionId });
  forwardHookResult(result, "FileChanged");
}

/**
 * Automatically reload project configuration when specific files change.
 */
async function autoReloadForPath(filePath: string): Promise<void> {
  const normalized = path.normalize(filePath);
  const basename = path.basename(normalized);

  // Project settings
  if (basename === "settings.json" || basename === "settings.local.json") {
    if (normalized.includes(".claude") || normalized.includes(".koi")) {
      invalidatePluginSettingsCache();
      refreshActivePlugins();
    }
    return;
  }

  // Plugin manifest
  if (basename === "plugin.json") {
    refreshActivePlugins();
    return;
  }

  // Agent definitions
  if (normalized.includes(path.join(".claude", "agents")) && basename.endsWith(".md")) {
    refreshAgentDefinitions(process.cwd());
    return;
  }

  // Skills (both .claude/skills and .claude/commands)
  if (
    (normalized.includes(path.join(".claude", "skills")) ||
      normalized.includes(path.join(".claude", "commands"))) &&
    basename.endsWith(".md")
  ) {
    await loadAllSkills(process.cwd());
    return;
  }

  // Koi config files
  if (normalized.includes(".koi") && basename.endsWith(".json")) {
    invalidatePluginSettingsCache();
    refreshActivePlugins();
    return;
  }
}
