/**
 * Bundled Skills Registry
 *
 * Built-in skills that are always available.
 * Ported from Claude Code's skills system, adapted for Koi.
 */

import {
  registerBundledSkill as registerSkill,
  getBundledSkillDefinitions,
} from "./loader.js";
import type {
  BundledSkillDefinition,
  ToolUseContext,
  HooksSettings,
  ContentBlockParam,
} from "./types.js";

// Re-export for bundled skill files
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  registerSkill(definition);
}

export { getBundledSkillDefinitions };

/**
 * Create a simple bundled skill with a static prompt
 */
export function createSimpleBundledSkill(params: {
  name: string;
  description: string;
  prompt?: string;
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  aliases?: string[];
  userInvocable?: boolean;
  model?: string;
  disableModelInvocation?: boolean;
  hooks?: HooksSettings;
  context?: "inline" | "fork";
  effort?: string;
  template?: string;
}): BundledSkillDefinition {
  return {
    name: params.name,
    description: params.description,
    whenToUse: params.whenToUse,
    argumentHint: params.argumentHint,
    allowedTools: params.allowedTools,
    aliases: params.aliases,
    userInvocable: params.userInvocable ?? true,
    model: params.model,
    disableModelInvocation: params.disableModelInvocation,
    hooks: params.hooks,
    context: params.context,
    effort: params.effort,
    template: params.template,
    getPromptForCommand: async (
      _args: string,
      _ctx: ToolUseContext
    ): Promise<ContentBlockParam[]> => {
      const content = params.prompt ?? params.template ?? "";
      return [{ type: "text" as const, text: content }];
    },
  };
}

/**
 * Create a bundled skill with argument substitution
 */
export function createBundledSkillWithArgs(params: {
  name: string;
  description: string;
  template: string;
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  aliases?: string[];
  userInvocable?: boolean;
}): BundledSkillDefinition {
  return {
    name: params.name,
    description: params.description,
    whenToUse: params.whenToUse,
    argumentHint: params.argumentHint,
    allowedTools: params.allowedTools,
    aliases: params.aliases,
    userInvocable: params.userInvocable ?? true,
    getPromptForCommand: async (
      args: string,
      _ctx: ToolUseContext
    ): Promise<ContentBlockParam[]> => {
      // Replace {{skill.args}} in template
      let content = params.template.replace(/\{\{skill\.args\}\}/g, args);
      // Also support <target> style placeholders
      if (args) {
        content = content.replace(/<target>/g, args);
        content = content.replace(/<args>/g, args);
        content = content.replace(/<files>/g, args);
      }
      return [{ type: "text" as const, text: content }];
    },
  };
}

// =============================================================================
// Bundled Skills
// =============================================================================

import { registerUpdateConfigSkill } from "./bundled/updateConfig.js";
import { registerDebugSkill } from "./bundled/debug.js";
import { registerLoremIpsumSkill } from "./bundled/loremIpsum.js";
import { registerSkillifySkill } from "./bundled/skillify.js";
import { registerRememberSkill } from "./bundled/remember.js";
import { registerSimplifySkill } from "./bundled/simplify.js";
import { registerBatchSkill } from "./bundled/batch.js";
import { registerStuckSkill } from "./bundled/stuck.js";

/**
 * Initialize all bundled skills.
 */
export function initBundledSkills(): void {
  registerUpdateConfigSkill();
  registerDebugSkill();
  registerLoremIpsumSkill();
  registerSkillifySkill();
  registerRememberSkill();
  registerSimplifySkill();
  registerBatchSkill();
  registerStuckSkill();
}

/**
 * Register common built-in skills
 */
export function registerCommonBundledSkills(): void {
  // --- Code Review ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Review",
      description:
        "Review code for bugs, security issues, and quality improvements",
      whenToUse:
        "Use this when asked to review code changes, pull requests, or specific files.",
      argumentHint: "<files>",
      aliases: ["review", "pr-review", "code-review"],
      allowedTools: ["Read", "Bash", "Grep", "Glob"],
      template: `# Code Review

You are performing a thorough code review. Review the following for {{skill.args}}:

## Review Focus Areas

### 1. Bugs and Logic Errors
- Off-by-one errors, null/undefined handling
- Race conditions, memory leaks
- Uncaught exceptions

### 2. Security Vulnerabilities
- SQL/Command injection risks
- XSS vulnerabilities
- Hardcoded secrets
- Missing authentication/authorization

### 3. Code Quality
- SOLID principles violations
- Unclear naming
- Missing error handling
- Code duplication

### 4. Performance Issues
- Unnecessary allocations
- Inefficient algorithms
- N+1 queries

### 5. Best Practices
- Framework conventions
- Testing coverage
- Documentation quality

## Output Format

For each issue found, provide:
- **File and line**: Location
- **Severity**: Critical / High / Medium / Low
- **Description**: What's wrong
- **Suggestion**: How to fix it

Review targets: {{skill.args}}

Provide a structured review with specific, actionable feedback.`,
    })
  );

  // --- Test Generation ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Test",
      description: "Generate comprehensive unit tests for code",
      whenToUse: "Use this when asked to write, generate, or improve tests.",
      argumentHint: "<files>",
      aliases: ["test", "tests", "testing", "spec", "unittest"],
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      template: `# Test Generation

You are generating comprehensive unit tests.

Target: {{skill.args}}

## Test Coverage Requirements

### 1. Happy Path
- Normal expected behavior
- Typical input/output scenarios

### 2. Edge Cases
- Empty inputs
- Boundary values (0, -1, max)
- Null/undefined inputs

### 3. Error Handling
- Invalid inputs
- Exception cases
- Error boundary conditions

## Test Quality Standards

- **Independent**: Each test runs in isolation
- **Descriptive**: Clear test names (e.g., \`should_return_empty_when_null\`)
- **AAA Pattern**: Arrange, Act, Assert
- **Deterministic**: Consistent results

## Project Conventions

Match the existing test style:
- Use the project's testing framework (Jest, Vitest, pytest, etc.)
- Follow existing patterns for setup/teardown
- Match file naming conventions

Generate complete, runnable test code with all necessary imports.`,
    })
  );

  // --- Explain ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Explain",
      description: "Explain how code works in detail",
      whenToUse: "Use this when asked to explain or understand code.",
      argumentHint: "<files>",
      aliases: ["explain", "explanation", "understand", "what"],
      allowedTools: ["Read", "Grep", "Glob"],
      template: `# Code Explanation

Explain the following code in detail: {{skill.args}}

## Explanation Structure

### 1. Purpose
What does this code do? What problem does it solve?

### 2. Structure
How is the code organized? What are the main components?

### 3. Data Flow
How does data move through the code?

### 4. Key Logic
Explain any complex algorithms or business logic

### 5. Dependencies
What external resources does this code depend on?

### 6. Edge Cases
How does it handle unusual situations?

Use clear, jargon-free language. Provide concrete examples where helpful.`,
    })
  );

  // --- Fix Bug ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Fix",
      description: "Fix bugs and issues in code",
      whenToUse: "Use this when asked to fix a bug, error, or issue.",
      argumentHint: "<description>",
      aliases: ["fix", "bugfix", "fix-bug", "bug"],
      allowedTools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      template: `# Bug Fixing

You are fixing a bug. 

Reported issue: {{skill.args}}

## Fixing Process

### 1. Understand
Read and understand the relevant code

### 2. Reproduce
If possible, write a minimal test that demonstrates the bug

### 3. Root Cause
Identify the actual cause of the bug

### 4. Fix
Implement the minimal change needed

### 5. Verify
Confirm the fix works and doesn't break other functionality

## Guidelines

- Make the smallest change that solves the problem
- Don't refactor unrelated code
- Add comments explaining non-obvious fixes
- Consider edge cases

After fixing, run existing tests to ensure nothing is broken.`,
    })
  );

  // --- Refactor ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Refactor",
      description: "Improve code structure without changing behavior",
      whenToUse:
        "Use this when asked to refactor or improve code structure.",
      argumentHint: "<files>",
      aliases: ["refactor", "refactoring", "improve", "clean"],
      allowedTools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      template: `# Code Refactoring

You are refactoring code to improve its quality.

Target: {{skill.args}}

## Goals

1. **Readability** - Make code easier to understand
2. **Maintainability** - Reduce coupling, increase cohesion
3. **Performance** - Don't degrade performance (or improve it)
4. **Testability** - Make code easier to test

## Do NOT

- Change behavior (this is refactoring, not rewriting)
- Add new features
- Make changes that aren't clearly improvements

## Process

1. Understand the current code and its tests
2. Identify specific improvements
3. Make small, incremental changes
4. Run tests after each change
5. Commit after each logical group of changes

Follow the existing code style and patterns.`,
    })
  );

  // --- Security Audit ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Security",
      description: "Review code for security vulnerabilities",
      whenToUse:
        "Use this when asked to review security or when handling sensitive data.",
      argumentHint: "<files>",
      aliases: ["security", "security-review", "audit", "vulnerability"],
      allowedTools: ["Read", "Bash", "Grep"],
      template: `# Security Review

You are performing a security audit.

Focus on: {{skill.args}}

## Vulnerability Checklist

### 1. Injection Attacks
- SQL injection
- Command injection
- LDAP/NoSQL injection
- XSS (Cross-Site Scripting)

### 2. Authentication & Authorization
- Broken authentication
- Missing authorization checks
- Insecure session management
- Privilege escalation

### 3. Data Exposure
- Sensitive data in logs
- Hardcoded credentials
- Insecure storage
- Data leakage

### 4. Cryptography
- Weak encryption
- Insecure random generation
- Custom crypto
- Improper key management

### 5. API Security
- Missing rate limiting
- CORS misconfiguration
- Missing input validation

## Output Format

For each finding:
- **Type**: Vulnerability type
- **Location**: File, line
- **Impact**: Risk assessment
- **Fix**: Remediation suggestion`,
    })
  );

  // --- Documentation ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Document",
      description: "Generate or improve documentation",
      whenToUse: "Use this when asked to write or improve documentation.",
      argumentHint: "<files or topic>",
      aliases: ["document", "docs", "documentation", "doc"],
      allowedTools: ["Read", "Write", "Glob", "Grep"],
      template: `# Documentation

You are generating documentation for: {{skill.args}}

## Documentation Standards

### 1. Audience
Write for the appropriate audience (developers, end users, etc.)

### 2. Structure
Use clear headings and organization

### 3. Examples
Include code examples where applicable

### 4. Completeness
Cover all important aspects

### 5. Clarity
Use simple, direct language

## What to Document

- Explain what something does (not how)
- Provide usage examples
- Document parameters and return values
- Note important caveats or limitations
- Link to related documentation

Match the style of existing documentation in the project.`,
    })
  );

  // --- Commit Message ---
  registerBundledSkill(
    createSimpleBundledSkill({
      name: "Commit",
      description: "Generate a conventional commit message for changes",
      whenToUse: "Use this when you need a good commit message.",
      argumentHint: "<type> <scope>",
      aliases: ["commit", "commitmsg", "gitcommit"],
      allowedTools: ["Bash", "Read"],
      template: `# Commit Message Generation

Generate a conventional commit message following Conventional Commits format.

## Format

\`\`\`
<type>(<scope>): <subject>

[optional body]

[optional footer]
\`\`\`

## Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Formatting, no code change
- **refactor**: Code change, no feature/fix
- **test**: Adding tests
- **chore**: Maintenance tasks

## Guidelines

- Use imperative mood ("add" not "added")
- Subject: max 50 characters
- Body: wrap at 72 characters
- Reference issues: "Fixes #123"

Generate a commit message for the current changes.`,
    })
  );

  // --- Migration ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Migrate",
      description: "Migrate code to a new framework, library, or syntax",
      whenToUse:
        "Use this when migrating code between frameworks or versions.",
      argumentHint: "<from> <to>",
      aliases: ["migrate", "migration", "upgrade", "convert"],
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
      template: `# Code Migration

You are migrating code.

From: {{skill.args}}

## Migration Process

### 1. Analysis
- Understand current implementation
- Identify all usage patterns
- Map old API to new API

### 2. Planning
- Create a migration checklist
- Identify breaking changes
- Plan for backward compatibility if needed

### 3. Implementation
- Update imports/references
- Replace deprecated patterns
- Update configuration

### 4. Testing
- Run existing tests
- Add migration-specific tests
- Verify functionality

## Best Practices

- Make one logical migration at a time
- Keep commits focused
- Update documentation
- Handle edge cases

Proceed with the migration.`,
    })
  );

  // --- Debug ---
  registerBundledSkill(
    createBundledSkillWithArgs({
      name: "Debug",
      description: "Debug and diagnose issues in code",
      whenToUse:
        "Use this when investigating bugs or unexpected behavior.",
      argumentHint: "<issue description>",
      aliases: ["debug", "diagnose", "troubleshoot", "investigate"],
      allowedTools: ["Read", "Bash", "Grep", "Glob"],
      template: `# Debugging Session

You are debugging an issue.

Issue: {{skill.args}}

## Debugging Approach

### 1. Gather Information
- What is the expected behavior?
- What is the actual behavior?
- When did this start happening?
- What changed recently?

### 2. Reproduce
- Can you reproduce the issue consistently?
- What are the minimal steps to reproduce?

### 3. Hypothesis
- What do you think is causing this?

### 4. Investigate
- Add logging if needed
- Check relevant code
- Trace the data flow

### 5. Fix and Verify
- Implement a fix
- Verify the fix works

## Diagnostic Commands

Run relevant diagnostic commands:
- Check logs
- Run tests
- Inspect state

Be systematic and thorough.`,
    })
  );

  // Also initialize the new bundled skills
  initBundledSkills();
}
