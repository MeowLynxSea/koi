/**
 * Plugin Hook Loader
 *
 * Loads plugin hooks into the global hook registry.
 */

import type { PluginError, HooksSettings } from "./types.js";
import { registerPluginHooks as registerInGlobalRegistry, unregisterPluginHooks as unregisterFromGlobalRegistry } from "../hooks/registry.js";

/**
 * Register hooks from a plugin into the global registry.
 */
export function registerPluginHooks(
  pluginName: string,
  pluginPath: string,
  hooksConfig: HooksSettings
): PluginError[] {
  const errors: PluginError[] = [];

  try {
    registerInGlobalRegistry(pluginName, pluginPath, hooksConfig as unknown as import("../hooks/types.js").HooksSettings);
  } catch (e) {
    errors.push({
      type: "component-load-failed",
      source: pluginPath,
      plugin: pluginName,
      component: "hooks",
      details: e instanceof Error ? e.message : String(e),
    });
  }

  return errors;
}

/**
 * Unregister all hooks for a plugin.
 */
export function unregisterPluginHooks(pluginName: string): void {
  unregisterFromGlobalRegistry(pluginName);
}
