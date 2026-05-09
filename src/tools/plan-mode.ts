/**
 * Plan Mode Tools
 *
 * enterPlanMode — switches the agent into Plan mode (disables write/edit/bash).
 * exitPlanMode  — submits a plan for user approval before switching back to Build mode.
 */

import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  setAgentMode,
  getAgentMode,
  getActiveToolNamesForMode,
  injectModeIntoSystemPrompt,
} from "../agent/mode.js";
import { activeSessionRef } from "../agent/hooks.js";
import { submitPlanForApproval } from "../agent/plan-ui.js";

export const enterPlanModeSchema = Type.Object({});

export type EnterPlanModeToolInput = Record<string, never>;

export const exitPlanModeSchema = Type.Object({
  plan: Type.String({
    description:
      "The detailed plan to present for approval. Must include concrete steps before exiting Plan Mode.",
  }),
});

export type ExitPlanModeToolInput = {
  plan: string;
};

export function createEnterPlanModeToolDefinition(): ToolDefinition {
  return {
    name: "enterPlanMode",
    label: "Enter Plan Mode",
    description:
      "Switch to Plan Mode. In Plan Mode, write/edit/bash tools are disabled so you can " +
      "research and design a solution before making changes. Use exitPlanMode when ready.",
    parameters: enterPlanModeSchema,
    executionMode: "parallel",
    async execute(_toolCallId, _params, _signal, _onUpdate) {
      const before = getAgentMode();
      if (before === "plan") {
        return {
          content: [{ type: "text", text: "Already in Plan Mode." }],
          details: { mode: "plan" },
        };
      }
      setAgentMode("plan");
      const session = activeSessionRef.current;
      if (session) {
        session.setActiveToolsByName(getActiveToolNamesForMode("plan"));
        injectModeIntoSystemPrompt(session, "plan");
        setTimeout(() => {
          void session.compact();
        }, 0);
      }
      return {
        content: [
          {
            type: "text",
            text:
              "Entered Plan Mode. Write/edit/bash tools are now disabled. " +
              "Research and design your solution, then call exitPlanMode with a detailed plan.",
          },
        ],
        details: { mode: "plan" },
      };
    },
  } as ToolDefinition;
}

export function createExitPlanModeToolDefinition(): ToolDefinition {
  return {
    name: "exitPlanMode",
    label: "Exit Plan Mode",
    description:
      "Submit a plan and request approval to exit Plan Mode and return to Build Mode. " +
      "If the user approves, Build Mode is restored. If rejected, stay in Plan Mode and revise.",
    parameters: exitPlanModeSchema,
    executionMode: "parallel",
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const input = params as ExitPlanModeToolInput;
      const before = getAgentMode();
      if (before !== "plan") {
        return {
          content: [{ type: "text", text: "Not in Plan Mode. No action taken." }],
          details: { approved: false },
        };
      }

      const result = await submitPlanForApproval({ plan: input.plan });
      if (result.approved) {
        setAgentMode("build");
        const session = activeSessionRef.current;
        if (session) {
          session.setActiveToolsByName(getActiveToolNamesForMode("build"));
          injectModeIntoSystemPrompt(session, "build");
          setTimeout(() => {
            void session
              .compact()
              .catch(() => {})
              .then(() => session.agent.continue());
          }, 0);
        }
        return {
          content: [
            {
              type: "text",
              text: "Plan approved. Exited Plan Mode and returned to Build Mode.",
            },
          ],
          details: { approved: true },
        };
      } else {
        const commentText = result.comment ? ` Comment: ${result.comment}` : "";
        return {
          content: [
            {
              type: "text",
              text:
                `Plan was rejected by the user.${commentText} You are still in Plan Mode. ` +
                "Please revise the plan based on user feedback and try exitPlanMode again.",
            },
          ],
          details: { approved: false, comment: result.comment },
          isError: true,
        };
      }
    },
  } as ToolDefinition;
}
