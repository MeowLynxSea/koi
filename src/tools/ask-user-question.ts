/**
 * AskUserQuestion Tool
 *
 * Allows the agent to ask the user a multiple-choice question.
 * The question is shown in a modal dialog; the user's answer is returned.
 * An "Other (custom)" option is always appended automatically.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { askUserQuestion } from "../agent/question-ui.js";

export const askUserQuestionSchema = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  options: Type.Array(Type.String(), {
    description: "List of answer options for the user to choose from",
  }),
});

export type AskUserQuestionToolInput = {
  question: string;
  options: string[];
};

export function createAskUserQuestionToolDefinition(): ToolDefinition {
  return {
    name: "askUserQuestion",
    label: "Ask User Question",
    description:
      "Ask the user a multiple-choice question to clarify requirements or collect preferences. " +
      "An additional 'Other (custom)' option is always provided automatically.",
    parameters: askUserQuestionSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const input = params as AskUserQuestionToolInput;
      const answer = await askUserQuestion({
        question: input.question,
        options: input.options,
      });
      return {
        content: [{ type: "text", text: answer }],
        details: { answer },
      };
    },
  } as ToolDefinition;
}
