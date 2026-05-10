/**
 * Simplify Skill
 * 
 * Review changed code for reuse, quality, and efficiency.
 * Adapted from Claude Code's simplify skill.
 */

import { registerBundledSkill } from "../bundled.js";

const SIMPLIFY_PROMPT = `# Simplify: Code Review and Cleanup

Review changed files for reuse, quality, and efficiency. Fix any issues found.

## Phase 1: Identify Changes

Use \`git diff\` (or \`git diff HEAD\` if there are staged changes) to see what changed. If there are no git changes, review the most recently modified files that the user mentioned or that were edited earlier in this conversation.

## Phase 2: Code Review

For each change, review for the following issues:

### Code Reuse
- **Search for existing utilities** that could replace newly written code
- Look in common locations: utility directories, shared modules, adjacent files
- **Flag duplicate functionality** - suggest using existing functions instead
- **Flag inline logic** that could use existing utilities:
  - String manipulation
  - Path handling
  - Environment checks
  - Type guards
  - Custom helpers

### Code Quality
- **Redundant state**: duplicate state, cached values that could be derived
- **Parameter sprawl**: adding parameters instead of generalizing
- **Copy-paste with variation**: near-duplicate blocks that should be unified
- **Leaky abstractions**: exposing internal details that should be encapsulated
- **Stringly-typed code**: raw strings where constants, enums, or branded types exist
- **Unnecessary nesting**: wrapper elements/components that add no value
- **Unnecessary comments**: comments explaining WHAT (well-named code does that) - delete; keep only non-obvious WHY comments

### Efficiency
- **Unnecessary work**: redundant computations, repeated reads, duplicate calls, N+1 patterns
- **Missed concurrency**: sequential operations that could run in parallel
- **Hot-path bloat**: blocking work added to startup or per-request paths
- **Recurring no-op updates**: state updates in loops/intervals that fire unconditionally
- **Unnecessary existence checks**: pre-checking before operating (TOCTOU anti-pattern)
- **Memory issues**: unbounded data structures, missing cleanup, event listener leaks
- **Overly broad operations**: reading entire files when only part is needed

## Phase 3: Fix Issues

Fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on.

When done, briefly summarize what was fixed (or confirm the code was already clean).

## Guidelines

- Focus on substantive improvements, not style preferences
- Preserve the original behavior - this is refactoring, not rewriting
- Make one logical change at a time
- Run tests after changes if available
- Keep commits focused

## Output Format

Present findings in this format:

\`\`\`
## Issues Found

### [Category] - File:path
**Problem**: Description of the issue
**Fix**: What was changed
\`\`\`

Or if no issues:

\`\`\`
## Summary

No significant issues found. The code is clean.
\`\`\`
`;

export function registerSimplifySkill(): void {
  registerBundledSkill({
    name: "simplify",
    description:
      "Review changed code for reuse, quality, and efficiency, then fix any issues found.",
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = SIMPLIFY_PROMPT;
      if (args) {
        prompt += `\n\n## Additional Focus\n\n${args}`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
