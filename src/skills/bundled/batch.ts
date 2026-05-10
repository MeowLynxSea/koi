/**
 * Batch Skill
 * 
 * Orchestrate large-scale changes across multiple parallel agents.
 * Adapted from Claude Code's batch skill.
 */

import { registerBundledSkill } from "../bundled.js";

const MIN_AGENTS = 3;
const MAX_AGENTS = 20;

const WORKER_INSTRUCTIONS = `After implementing the change:
1. **Review** — Use /simplify to review and clean up changes
2. **Test** — Run the project's test suite
3. **Commit** — Commit changes with a clear message
4. **Report** — End with a summary of what was done`;



const MISSING_INSTRUCTION_MESSAGE = `Provide an instruction describing the batch change you want to make.

Examples:
  /batch add TypeScript to all JavaScript files
  /batch replace lodash with native equivalents
  /batch add error handling to all API routes`;

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: "batch",
    description:
      "Plan and execute a large-scale change across multiple parallel agents.",
    whenToUse:
      "Use when making sweeping changes across many files that can be decomposed into independent parallel units.",
    argumentHint: "<instruction>",
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const instruction = args.trim();
      if (!instruction) {
        return [{ type: "text", text: MISSING_INSTRUCTION_MESSAGE }];
      }

      const prompt = `# Batch: Parallel Work Orchestration

You are orchestrating a large, parallelizable change across this codebase.

## User Instruction

${instruction}

## Phase 1: Research and Plan

1. **Understand the scope.** Research what files, patterns, and locations need to change.
2. **Decompose into units.** Break the work into ${MIN_AGENTS}–${MAX_AGENTS} self-contained units. Each unit must:
   - Be independently implementable
   - Be mergeable without depending on another unit
   - Be roughly uniform in size

   Scale the count to the actual work: few files → closer to ${MIN_AGENTS}; many files → closer to ${MAX_AGENTS}.

3. **Determine verification.** Figure out how to verify each change works:
   - Run tests
   - Check for linting errors
   - Verify the change visually if applicable

4. **Write the plan.** Include:
   - Summary of scope
   - Numbered list of work units with file lists
   - Verification approach for each unit

## Phase 2: Execute in Parallel

Spawn one agent per work unit. Each agent should:
- Have the full context of what to do
- Know the files to modify
- Understand the verification approach
- Follow these instructions:

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

## Phase 3: Track Progress

Track progress with a status table:

| # | Unit | Status |
|---|------|--------|
| 1 | <title> | running |
| 2 | <title> | done |

As agents complete, update the status and summarize results.

## Final Summary

When all agents finish, provide a summary of:
- How many units completed successfully
- Any failures or issues encountered
- Overall impact of the changes
`;

      return [{ type: "text", text: prompt }];
    },
  });
}
