---
name: Example Skill
description: A demonstration skill showing the SKILL.md format
when_to_use: Use this when you want to see how skills are structured
argument-hint: <topic>
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Example Skill

This is an example skill that demonstrates the SKILL.md format.

## Frontmatter Fields

The frontmatter section (between `---` markers) defines metadata:

- **name**: Display name for the skill
- **description**: What this skill does
- **when_to_use**: Guidance on when to invoke this skill
- **argument-hint**: Format for required arguments (e.g., `<file>`)
- **allowed-tools**: Tools this skill is allowed to use

## Content

The markdown body contains the instructions that will be passed to the agent
when this skill is invoked.

## Usage

Skills can be invoked by typing `/example <topic>` in the chat.

For example: `/example typescript`

## Creating Custom Skills

1. Create a `.claude/skills/` directory in your project
   (or use `~/.config/koi/skills/` for user-wide skills)
2. Create a subdirectory for your skill
3. Add a `SKILL.md` file with the frontmatter and instructions

```
.claude/skills/
└── my-skill/
    └── SKILL.md
```
