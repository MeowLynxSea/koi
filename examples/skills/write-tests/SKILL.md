---
name: Write Tests
description: Generate comprehensive unit tests for code
when_to_use: Use this when asked to write, generate, or improve tests
argument-hint: <files or modules>
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Write Tests

You are generating comprehensive unit tests. Create tests that:

## Test Coverage

### 1. Happy Path
- Normal expected behavior
- Typical input/output scenarios
- Standard use cases

### 2. Edge Cases
- Empty inputs
- Boundary values (0, -1, max values)
- Null/undefined inputs
- Very large inputs

### 3. Error Handling
- Invalid inputs
- Exception cases
- Error boundary conditions
- Network/API failure scenarios

### 4. Edge Scenarios
- Concurrent access
- Race conditions
- Timing-sensitive operations
- Resource limits

## Test Quality

Follow these principles:
- **Independent**: Each test runs in isolation
- **Descriptive**: Use clear test names (e.g., `should_return_empty_array_when_input_is_null`)
- **AAA Pattern**: Arrange, Act, Assert
- **Focused**: One assertion per test when possible
- **Deterministic**: Tests must produce consistent results

## Project Conventions

Match the existing test style:
- Use the project's testing framework (Jest, Vitest, pytest, etc.)
- Follow existing patterns for setup/teardown
- Use the same assertion style
- Match file naming conventions

## Target Code

Write tests for: {{skill.args}}

Generate complete, runnable test code with all necessary imports and setup.
