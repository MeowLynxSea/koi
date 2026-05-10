/**
 * Debug Skill
 * 
 * Enable debug logging and help diagnose issues in Koi.
 * Adapted from Claude Code's debug skill.
 */

import { registerBundledSkill } from "../bundled.js";



export function registerDebugSkill(): void {
  registerBundledSkill({
    name: "debug",
    description:
      "Enable debug logging for this session and help diagnose issues. Read debug logs and provide diagnostic information.",
    allowedTools: ["Read", "Grep", "Glob"],
    argumentHint: "[issue description]",
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      const prompt = `# Debug Skill

Help the user debug an issue they're encountering in this Koi session.

## Session Context

Working directory: \`{{cwd}}\`
Current time: {{timestamp}}

## Issue Description

${args || "The user did not describe a specific issue. Ask clarifying questions to understand what problem they are experiencing."}

## Diagnostic Steps

### 1. Gather Information
Ask the user to describe:
- What were you trying to do?
- What happened instead?
- When did this start happening?
- What changed recently?

### 2. Check Common Issues

**Connection Issues:**
- Is the API provider configured correctly?
- Is the API key valid?
- Is there a network connectivity issue?

**Model Issues:**
- Is the model ID correct?
- Is the model available for this provider?
- Are there rate limit errors?

**Tool Issues:**
- Are the required tools available?
- Is there a permission issue?
- Are there file system errors?

### 3. Suggest Next Steps

Based on the issue, suggest:
- Configuration fixes
- Alternative approaches
- Commands to run for more diagnostics
- Settings to check

## Settings Files to Check

- Koi Settings: \`~/.config/koi/settings.json\`
- Pi Settings: \`~/.config/koi/pi/settings.json\`

## Instructions

1. Ask clarifying questions if the issue is unclear
2. Read relevant configuration files
3. Identify the root cause
4. Provide specific, actionable fixes
5. Explain what went wrong in plain language
`;

      return [{ type: "text", text: prompt }];
    },
  });
}
