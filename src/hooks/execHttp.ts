/**
 * HTTP Hook Executor
 *
 * POSTs hook input JSON to a URL with SSRF protection and env var interpolation.
 */

import type { HttpHook, HookInput, HookJSONOutput } from "./types.js";
import { isUrlAllowed } from "./ssrfGuard.js";
import { getPluginSettings } from "../plugins/settings.js";

export async function executeHttpHook(
  hook: HttpHook,
  input: HookInput,
  options: { timeout: number }
): Promise<HookJSONOutput> {
  const { timeout } = options;

  // SSRF guard
  const settings = getPluginSettings();
  if (!isUrlAllowed(hook.url, settings.allowedHttpHookUrls)) {
    throw new Error(`HTTP hook URL not allowed: ${hook.url}`);
  }

  // Interpolate env vars in headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(hook.headers || {}),
  };

  const allowedEnvVars = new Set(hook.allowedEnvVars || []);
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = interpolateEnvVars(value, allowedEnvVars);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await fetch(hook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    if (!text.trim()) {
      return { continue: true };
    }

    try {
      return JSON.parse(text) as HookJSONOutput;
    } catch {
      return { continue: true, systemMessage: text };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

function interpolateEnvVars(value: string, allowedVars: Set<string>): string {
  return value.replace(/\$\{(\w+)\}/g, (_match, varName) => {
    if (!allowedVars.has(varName)) return "";
    return process.env[varName] || "";
  }).replace(/\$(\w+)/g, (_match, varName) => {
    if (!allowedVars.has(varName)) return "";
    return process.env[varName] || "";
  });
}
