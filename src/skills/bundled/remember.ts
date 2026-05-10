/**
 * Remember Skill
 * 
 * Review and organize session memory and project context.
 * Adapted from Claude Code's remember skill.
 */

import { registerBundledSkill } from "../bundled.js";

const REMEMBER_PROMPT = `# Memory Review

## Goal

Review the session memory and project context. Produce a clear report of proposed changes, grouped by action type. Do NOT apply changes — present proposals for user approval.

## Steps

### 1. Gather All Memory Layers

Check for these memory files in the project root:

| File | Purpose | Should Commit |
|------|---------|---------------|
| CLAUDE.md | Project conventions for all contributors | Yes |
| CLAUDE.local.md | Personal preferences, not for others | .gitignore |
| .claude/commands/ | Custom slash commands | Yes |

**Success criteria**: You have found and read all relevant memory files.

### 2. Classify Each Entry

For each piece of context or memory, determine the best destination:

| Destination | What belongs there | Examples |
|-------------|-------------------|----------|
| **CLAUDE.md** | Project-wide conventions | "use bun not npm", "API routes use kebab-case", "test command is bun test" |
| **CLAUDE.local.md** | Personal preferences for this user only | "I prefer concise responses", "always explain trade-offs" |
| **.claude/commands/** | Custom slash commands | Custom /deploy, /test commands |
| **Stay in memory** | Session-specific or temporary | One-time observations, uncertain patterns |

**Important distinctions:**
- CLAUDE.md and CLAUDE.local.md contain instructions for the agent, not user preferences for external tools
- Workflow practices (PR conventions, merge strategies) are ambiguous — ask the user if they're personal or team-wide
- When unsure, ask rather than guess

**Success criteria**: Each entry has a proposed destination or is flagged as ambiguous.

### 3. Identify Cleanup Opportunities

Scan across all layers for:

- **Duplicates**: Memory entries already captured in CLAUDE.md or CLAUDE.local.md
- **Outdated**: Older entries contradicted by newer information
- **Conflicts**: Contradictions between any two layers
- **Stale**: Information that was true before but is no longer relevant

**Success criteria**: All cross-layer issues identified.

### 4. Present the Report

Output a structured report grouped by action type:

**1. Promotions** — entries to move, with destination and rationale
**2. Cleanup** — duplicates, outdated entries, conflicts to resolve
**3. Ambiguous** — entries where you need the user's input on destination
**4. No action needed** — brief note on entries that should stay put

If no memory files exist, say so and offer to help create CLAUDE.md.

**Success criteria**: User can review and approve/reject each proposal individually.

## Rules

- Present ALL proposals before making any changes
- Do NOT modify files without explicit user approval
- Do NOT create new files unless the target doesn't exist yet
- Ask about ambiguous entries — don't guess
- Focus on actionable, useful memory rather than comprehensive documentation
`;

export function registerRememberSkill(): void {
  registerBundledSkill({
    name: "remember",
    description:
      "Review session memory and project context. Propose promotions to CLAUDE.md, CLAUDE.local.md, or custom commands. Also detects outdated, conflicting, and duplicate entries.",
    whenToUse:
      "Use when the user wants to review, organize, or persist their session memory. Also useful for cleaning up outdated or conflicting context.",
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = REMEMBER_PROMPT;
      if (args) {
        prompt += `\n\n## Additional Context\n\n${args}`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
