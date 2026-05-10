/**
 * Update Config Skill
 * 
 * Configure Koi settings via settings.json.
 * Adapted from Claude Code's update-config skill to fit Koi's architecture.
 */

import { registerBundledSkill } from "../bundled.js";

const UPDATE_CONFIG_PROMPT = `# Update Config Skill

Modify Koi configuration by editing settings.json files.

## Settings File Locations

| File | Scope | Purpose |
|------|-------|---------|
| \`~/.config/koi/settings.json\` | Global | Koi user settings (providers, models) |
| \`~/.config/koi/pi/settings.json\` | Global | Pi agent runtime settings |
| \`~/.config/koi/pi/models.json\` | Global | Pi model registry |
| \`~/.config/koi/pi/auth.json\` | Global | Pi authentication storage |

## Koi Settings Schema

\`\`\`json
{
  "version": 1,
  "sessionTitle": "Session Name",
  "providers": {
    "provider-name": {
      "provider": "provider-name",
      "authMethod": "apikey" | "oauth",
      "credential": "sk-..." 
    }
  },
  "currentModel": {
    "provider": "openai",
    "modelId": "gpt-4o"
  },
  "auxiliaryModel": {
    "provider": "anthropic", 
    "modelId": "claude-sonnet-4-7-20250514"
  }
}
\`\`\`

## Available Configuration Options

### Provider Configuration
\`\`\`json
{
  "providers": {
    "provider-name": {
      "provider": "provider-name",
      "authMethod": "apikey" | "oauth",
      "credential": "your-api-key-or-token"
    }
  }
}
\`\`\`

Supported providers: openai, anthropic, google, ollama, groq, mistral, etc.

### Model Configuration
\`\`\`json
{
  "currentModel": {
    "provider": "openai",
    "modelId": "gpt-4o"
  },
  "auxiliaryModel": {
    "provider": "anthropic",
    "modelId": "claude-sonnet-4-7-20250514"
  }
}
\`\`\`

The auxiliary model is used for secondary tasks like reflection or critique.

### Session Configuration
\`\`\`json
{
  "sessionTitle": "My Project"
}
\`\`\`

## CRITICAL: Read Before Write

**Always read the existing settings file before making changes.** Merge new settings with existing ones - never replace the entire file unless explicitly asked.

## Workflow

1. **Read existing file** - Use Read tool on the target settings file
2. **Analyze current state** - Understand what's already configured
3. **Merge carefully** - Preserve existing settings, especially nested objects
4. **Edit file** - Use Edit tool for modifications
5. **Confirm** - Tell user what was changed

## Merging Objects (Important!)

When adding new fields to existing objects, **merge with existing**, don't replace:

**WRONG** (replaces existing providers):
\`\`\`json
{ "providers": { "openai": { ... } } }
\`\`\`

**RIGHT** (preserves existing + adds new):
\`\`\`json
{
  "providers": {
    "existing-provider": { ... },
    "openai": { ... }
  }
}
\`\`\`

## Common Tasks

### Adding a Provider

User: "add OpenAI provider" or "configure OpenAI"

1. Read \`~/.config/koi/settings.json\`
2. Add provider to the providers object
3. Validate by attempting a test request

### Switching the Current Model

User: "switch to gpt-4o" or "use claude as the main model"

1. Read current settings
2. Update the currentModel field with new provider and modelId
3. Confirm the switch

### Configuring an Auxiliary Model

User: "set up auxiliary model" or "add a critique model"

1. Read current settings
2. Add or update auxiliaryModel field
3. The auxiliary model will be used for secondary tasks

### Changing Session Title

User: "rename this session"

1. Read settings file
2. Update sessionTitle field

## File Paths Reference

- Koi Settings: \`~/.config/koi/settings.json\`
- Pi Settings: \`~/.config/koi/pi/settings.json\`
- Pi Models: \`~/.config/koi/pi/models.json\`
- Pi Auth: \`~/.config/koi/pi/auth.json\`

## Troubleshooting

If configuration changes don't take effect:

1. **Check JSON syntax** - Invalid JSON silently fails
2. **Verify provider name** - Must match exactly (case-sensitive)
3. **Validate API key** - Try a simple API request
4. **Check file permissions** - Settings file should be readable
5. **Restart if needed** - Some settings require a new session

## Example Workflows

### Adding a New Provider

User: "add the anthropic provider with my API key"

1. Read \`~/.config/koi/settings.json\`
2. Merge new provider with existing providers:
\`\`\`json
{
  "providers": {
    "existing-provider": { ... },
    "anthropic": {
      "provider": "anthropic",
      "authMethod": "apikey",
      "credential": "sk-ant-..."
    }
  }
}
\`\`\`
3. Tell user the provider was added

### Switching Models

User: "use claude-sonnet as my main model"

1. Read settings
2. Update currentModel:
\`\`\`json
{
  "currentModel": {
    "provider": "anthropic",
    "modelId": "claude-sonnet-4-7-20250514"
  }
}
\`\`\`

## Notes

- Provider names are case-sensitive
- Model IDs must match the exact format returned by the provider
- Changes to settings.json take effect immediately for new operations
- Some changes may require starting a new session
`;

export function registerUpdateConfigSkill(): void {
  registerBundledSkill({
    name: "update-config",
    description:
      "Configure Koi settings including providers, models, and Pi agent settings. Use for: adding API providers, switching models, configuring auxiliary models, changing session title, or modifying settings.json files.",
    allowedTools: ["Read"],
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = UPDATE_CONFIG_PROMPT;
      if (args) {
        prompt += `\n\n## User Request\n\n${args}`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
