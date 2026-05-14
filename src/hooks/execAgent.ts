/**
 * Agent Hook Executor
 *
 * Spawns a subagent with limited tools to evaluate a prompt.
 */

import type { AgentHook, HookInput, HookJSONOutput } from "./types.js";

export async function executeAgentHook(
  hook: AgentHook,
  input: HookInput,
  options: { timeout: number }
): Promise<HookJSONOutput> {
  const { timeout } = options;

  const promptText = hook.prompt.replace(/\$ARGUMENTS/g, JSON.stringify(input));

  // TODO: Use koi's subagent registry to spawn a real subagent
  // For now, fall back to the auxiliary model with a system prompt
  const { callAuxiliaryModel } = await import("../config/settings.js");

  const systemPrompt = `You are an agentic verifier. Your job is to evaluate the following request and respond with JSON only.

Request: ${promptText}

Hook input: ${JSON.stringify(input)}

Respond with JSON matching:
{
  "continue": boolean,
  "stopReason": string (optional),
  "systemMessage": string (optional),
  "decision": "approve" | "block" (optional),
  "reason": string (optional)
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

  try {
    const response = await callAuxiliaryModel(systemPrompt, [
      { role: "user", content: promptText, timestamp: Date.now() },
    ]);

    clearTimeout(timeoutId);

    if (!response) {
      return { continue: true };
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { continue: true, systemMessage: response };
    }

    try {
      return JSON.parse(jsonMatch[0]) as HookJSONOutput;
    } catch {
      return { continue: true, systemMessage: response };
    }
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
