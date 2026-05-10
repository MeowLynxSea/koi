/**
 * Skillify Skill
 * 
 * Capture this session's repeatable process into a reusable skill.
 * Adapted from Claude Code's skillify skill.
 */

import { registerBundledSkill } from "../bundled.js";

const SKILLIFY_PROMPT = `# Skillify

Capture this session's repeatable process as a reusable skill.

## Your Task

### Step 1: Analyze the Session

Before asking questions, analyze what happened in this session:
- What repeatable process was performed?
- What were the inputs/parameters?
- What were the distinct steps (in order)?
- What tools and permissions were needed?
- What proved the process succeeded?

### Step 2: Interview the User

Use AskUserQuestion to understand what they want to automate.

**Round 1: High-level confirmation**
- Suggest a name and description based on your analysis
- Confirm the goal and success criteria

**Round 2: Details**
- Present the high-level steps you identified
- Suggest arguments if the skill needs parameters
- Ask where to save: repo-specific (\`.claude/skills/\`) or personal (\`~/.config/koi/skills/\`)

**Round 3: Step details**
For each major step, clarify:
- What does this step produce that later steps need?
- What proves this step succeeded?
- Should the user confirm before proceeding?
- Are any steps independent and could run in parallel?

**Round 4: Final questions**
- Confirm when this skill should be invoked
- Ask for trigger phrases (e.g., "cherry-pick to release", "hotfix")

### Step 3: Write the SKILL.md

Create the skill file at the chosen location.

Use this format:

\`\`\`markdown
---
name: skill-name
description: One-line description of what this skill does
allowed-tools:
  - ToolName
  - Bash(specific:command)
when_to_use: When to auto-invoke this skill
argument-hint: "<arg1> <arg2>"
---

# Skill Title

Description of skill

## Goal
Clearly stated goal

## Steps

### 1. Step Name
What to do

**Success criteria**: How to know this step is done

### 2. Step Name
...

## Notes
- Gotchas to watch out for
- User corrections from this session
\`\`\`

### Step 4: Confirm and Save

Before writing, output the complete SKILL.md for review. Ask for confirmation using AskUserQuestion.

After writing, tell the user:
- Where the skill was saved
- How to invoke it: \`/skill-name [arguments]\`
- That they can edit the SKILL.md directly to refine it
`;

export function registerSkillifySkill(): void {
  registerBundledSkill({
    name: "skillify",
    description:
      "Capture this session's repeatable process into a reusable skill.",
    allowedTools: [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "AskUserQuestion",
      "Bash(mkdir:*)",
    ],
    userInvocable: true,
    disableModelInvocation: true,
    argumentHint: "[description of the process to capture]",
    async getPromptForCommand(args) {
      let prompt = SKILLIFY_PROMPT;
      if (args) {
        prompt += `\n\n## User Description\n\nThe user wants to capture: "${args}"`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
