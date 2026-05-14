/**
 * Prompt Hook Integration
 *
 * Intercepts user prompts before they are sent to the agent.
 * Emits UserPromptSubmit event.
 */

import { executeHooksForEvent } from "../engine.js";
import type { HookInput } from "../types.js";

/**
 * Intercept a user prompt and run UserPromptSubmit hooks.
 * Returns the potentially modified prompt text.
 */
export async function interceptUserPrompt(
  prompt: string,
  sessionId?: string
): Promise<string> {
  const hookInput: HookInput = {
    event: "UserPromptSubmit",
    prompt,
    session_id: sessionId,
  };

  const result = await executeHooksForEvent("UserPromptSubmit", hookInput, {
    sessionId,
  });

  if (result.preventContinuation) {
    const reason = result.stopReason || "Blocked by UserPromptSubmit hook";
    throw new Error(reason);
  }

  // Hooks can inject additional context
  if (result.additionalContext) {
    return `${prompt}\n\n[Hook context]: ${result.additionalContext}`;
  }

  return prompt;
}
