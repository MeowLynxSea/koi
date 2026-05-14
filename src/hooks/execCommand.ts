/**
 * Command Hook Executor
 *
 * Spawns shell commands with plugin context env vars.
 */

import { spawn } from "child_process";
import path from "path";
import os from "os";
import type { CommandHook, HookInput, HookJSONOutput } from "./types.js";
import { emitHookProgress } from "./events.js";
import { registerPendingAsyncHook, completePendingAsyncHook } from "./asyncRegistry.js";

export async function executeCommandHook(
  hook: CommandHook,
  input: HookInput,
  options: { timeout: number; pluginRoot?: string }
): Promise<HookJSONOutput> {
  const { timeout, pluginRoot } = options;
  const shell = hook.shell || "bash";
  const isWindows = os.platform() === "win32";

  const command = hook.command;
  const inputJson = JSON.stringify(input);

  const env = {
    ...process.env,
    KOI_HOOK_INPUT: inputJson,
    KOI_PLUGIN_ROOT: pluginRoot || "",
    KOI_PLUGIN_DATA: pluginRoot ? path.join(os.homedir(), ".config", "koi", "plugin-data") : "",
    KOI_EVENT: input.event,
  };

  const shellCmd = shell === "powershell" && isWindows
    ? "powershell.exe"
    : shell === "bash"
      ? (isWindows ? "bash.exe" : process.env["SHELL"] || "bash")
      : process.env["SHELL"] || "bash";
  const args = shell === "powershell" ? ["-Command", command] : ["-c", command];

  // Handle async mode
  if (hook.async || hook.asyncRewake) {
    const { id } = registerPendingAsyncHook(
      pluginRoot ? path.basename(pluginRoot) : "settings",
      input.event,
      !!hook.asyncRewake
    );

    const child = spawn(shellCmd, args, {
      env,
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const trimmed = stdout.trim();
      try {
        const json = JSON.parse(trimmed || "{}") as HookJSONOutput;
        completePendingAsyncHook(id, json);
      } catch {
        completePendingAsyncHook(id, {
          continue: code === 0,
          stopReason: stderr.trim() || `Hook exited with code ${code}`,
        });
      }
    });

    return { continue: true, async: true };
  }

  // Synchronous mode
  return new Promise((resolve, reject) => {
    emitHookProgress({
      type: "started",
      hookType: "command",
      event: input.event,
      message: hook.statusMessage || `Running command hook`,
    });

    const child = spawn(shellCmd, args, {
      env,
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
      emitHookProgress({
        type: "progress",
        hookType: "command",
        event: input.event,
        stdout: data.toString(),
      });
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
      emitHookProgress({
        type: "progress",
        hookType: "command",
        event: input.event,
        stderr: data.toString(),
      });
    });

    child.on("error", (err) => {
      emitHookProgress({
        type: "error",
        hookType: "command",
        event: input.event,
        message: err.message,
      });
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        // Exit code 2 is special: blocking error for asyncRewake
        if (code === 2 && hook.asyncRewake) {
          try {
            const json = JSON.parse(stdout.trim() || "{}") as HookJSONOutput;
            resolve(json);
          } catch {
            resolve({
              continue: false,
              stopReason: stderr.trim() || `Hook exited with code ${code}`,
            });
          }
          return;
        }
      }

      // Parse JSON from stdout
      const trimmed = stdout.trim();
      if (!trimmed) {
        emitHookProgress({
          type: "response",
          hookType: "command",
          event: input.event,
          message: "Hook completed with no output",
        });
        resolve({ continue: true });
        return;
      }

      try {
        const json = JSON.parse(trimmed) as HookJSONOutput;
        emitHookProgress({
          type: "response",
          hookType: "command",
          event: input.event,
          message: json.stopReason || json.systemMessage,
        });
        resolve(json);
      } catch {
        // Not JSON — treat as plain output
        emitHookProgress({
          type: "response",
          hookType: "command",
          event: input.event,
          message: trimmed,
        });
        resolve({ continue: true, systemMessage: trimmed });
      }
    });
  });
}
