/**
 * Prompt Hook Executor
 *
 * Evaluates a prompt with an LLM using structured JSON output.
 */

import type { PromptHook, HookInput, HookJSONOutput } from "./types.js";
import { callAuxiliaryModel } from "../config/settings.js";

export async function executePromptHook(
  hook: PromptHook,
  input: HookInput,
  options: { timeout: number }
): Promise<HookJSONOutput> {
  const { timeout } = options;

  const promptText = hook.prompt.replace(/\$ARGUMENTS/g, JSON.stringify(input));

  const systemPrompt = `You are a hook evaluator. Respond ONLY with valid JSON matching this schema:
{
  "continue": boolean (default true),
  "stopReason": string (optional),
  "systemMessage": string (optional),
  "decision": "approve" | "block" (optional),
  "reason": string (optional),
  "hookSpecificOutput": { "hookEventName": "${input.event}", ... } (optional)
}

Do not include any other text outside the JSON.`;

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

    // Extract JSON from response
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
