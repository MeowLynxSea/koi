/**
 * Stuck Skill
 * 
 * Diagnose frozen or slow Koi sessions.
 */

import { registerBundledSkill } from "../bundled.js";

const STUCK_PROMPT = `# /stuck — Diagnose Frozen/Slow Sessions

The user thinks a Koi session is frozen, stuck, or very slow. Investigate and diagnose.

## What to Look For

Signs of a stuck session:
- **High CPU (≥90%) sustained** — likely an infinite loop or heavy processing
- **High Memory (≥4GB)** — possible memory leak
- **Network timeout** — API requests taking too long
- **Process not responding** — UI frozen but process running

## Investigation Steps

### 1. Check Running Processes
\`\`\`
ps aux | grep -E "(koi|node)" | grep -v grep
\`\`\`

### 2. Check System Resources
\`\`\`
top -l 1 | head -20
\`\`\`

### 3. Check Network Activity
\`\`\`
# Is the API responding?
curl -s --max-time 5 https://api.openai.com/v1/models 2>&1 || echo "API timeout or error"
\`\`\`

### 4. Check Logs
Look for error messages in:
- Terminal output
- Any log files

### 5. Common Causes

**High CPU:**
- Model is generating a very long response
- Infinite loop in tool execution
- Heavy regex or processing

**High Memory:**
- Context window getting full
- Large file being processed
- Memory leak in process

**Not Responding:**
- API rate limiting
- Network connectivity issues
- Model taking too long to respond

## Report

Present findings in this format:

\`\`\`
## Diagnosis

**Issue**: [What appears to be wrong]
**Cause**: [Likely reason]
**Impact**: [Effect on session]

## Recommendations

1. [Action to take]
2. [Action to take]
\`\`\`

## Suggested Fixes

Based on the diagnosis:
- If API timeout: Try again or switch to a faster model
- If memory issue: Start a new session
- If infinite loop: Cancel current operation and try different approach
- If rate limited: Wait and retry, or use different API key
`;

export function registerStuckSkill(): void {
  registerBundledSkill({
    name: "stuck",
    description:
      "Diagnose frozen, stuck, or slow Koi sessions. Investigate CPU, memory, network, and API issues.",
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = STUCK_PROMPT;
      if (args) {
        prompt += `\n\n## User Context\n\n${args}`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
