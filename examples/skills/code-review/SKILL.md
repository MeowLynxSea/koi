---
name: Code Review
description: Review code for bugs, security issues, and quality improvements
when_to_use: Use this when asked to review code, pull requests, or specific files
argument-hint: <files or paths>
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Code Review

You are performing a thorough code review. Analyze the provided code for:

## 1. Bugs and Logic Errors
- Off-by-one errors
- Null/undefined handling
- Race conditions
- Memory leaks
- Uncaught exceptions

## 2. Security Vulnerabilities
- SQL injection risks
- Command injection
- XSS vulnerabilities
- Insecure deserialization
- Hardcoded secrets
- Missing authentication/authorization

## 3. Code Quality
- SOLID principles violations
- Unclear naming
- Missing error handling
- Code duplication
- Overly complex logic

## 4. Performance Issues
- Unnecessary allocations
- Inefficient algorithms
- N+1 queries
- Missing caching opportunities

## 5. Best Practices
- Framework conventions
- Testing coverage
- Documentation quality
- API design

## Output Format

For each issue found, provide:
1. **File and line number**
2. **Severity**: Critical / High / Medium / Low
3. **Description**: What's wrong
4. **Suggestion**: How to fix it

## Review Target

Review: {{skill.args}}

Provide a structured review with specific, actionable feedback.
