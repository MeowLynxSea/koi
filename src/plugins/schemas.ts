/**
 * Plugin Schemas
 *
 * Zod schemas for validating plugin.json, hooks.json, and related configs.
 * Structurally compatible with Claude Code's plugin manifest schema.
 */

import { z } from "zod";

// ============================================================================
// Helpers
// ============================================================================

const RelativePath = z.string().refine((p) => p.startsWith("./") || p.startsWith("../"), {
  message: "Path must be relative (start with ./ or ../)",
});

const RelativeJSONPath = RelativePath.refine((p) => p.endsWith(".json"), {
  message: "JSON path must end with .json",
});

// ============================================================================
// Hook Schemas
// ============================================================================

const IfConditionSchema = z
  .string()
  .optional()
  .describe(
    'Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)").'
  );

const BashCommandHookSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1),
  if: IfConditionSchema,
  shell: z.enum(["bash", "powershell"]).optional(),
  timeout: z.number().positive().optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
  async: z.boolean().optional(),
  asyncRewake: z.boolean().optional(),
});

const PromptHookSchema = z.object({
  type: z.literal("prompt"),
  prompt: z.string().min(1),
  if: IfConditionSchema,
  timeout: z.number().positive().optional(),
  model: z.string().optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
});

const HttpHookSchema = z.object({
  type: z.literal("http"),
  url: z.string().url(),
  if: IfConditionSchema,
  timeout: z.number().positive().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  allowedEnvVars: z.array(z.string()).optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
});

const AgentHookSchema = z.object({
  type: z.literal("agent"),
  prompt: z.string().min(1),
  if: IfConditionSchema,
  timeout: z.number().positive().optional(),
  model: z.string().optional(),
  statusMessage: z.string().optional(),
  once: z.boolean().optional(),
});

export const HookCommandSchema = z.discriminatedUnion("type", [
  BashCommandHookSchema,
  PromptHookSchema,
  AgentHookSchema,
  HttpHookSchema,
]);

export const HookMatcherSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookCommandSchema),
});

export const HooksSettingsSchema = z.record(z.string(), z.array(HookMatcherSchema));
export type ValidatedHooksSettingsType = z.infer<typeof HooksSettingsSchema>;

// ============================================================================
// Plugin Manifest Schemas
// ============================================================================

export const PluginAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  url: z.string().optional(),
});

export const CommandMetadataSchema = z
  .object({
    source: RelativePath.optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    argumentHint: z.string().optional(),
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      (data.source && !data.content) || (!data.source && data.content) || (!data.source && !data.content),
    { message: 'Command must have either "source" or "content", but not both' }
  );

export const PluginUserConfigOptionSchema = z.object({
  type: z.enum(["string", "number", "boolean", "directory", "file"]),
  title: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  multiple: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

// MCP server config schema (subset matching koi's McpServerConfig)
const McpServerConfigSchema = z.object({
  type: z.enum(["stdio", "sse", "http", "ws"]).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  authToken: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const PluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((n) => !n.includes(" "), {
      message: "Plugin name cannot contain spaces. Use kebab-case.",
    }),
  version: z.string().optional(),
  description: z.string().optional(),
  author: PluginAuthorSchema.optional(),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),

  // Components
  commands: z
    .union([RelativePath, z.array(RelativePath), z.record(z.string(), CommandMetadataSchema)])
    .optional(),
  agents: z.union([RelativePath, z.array(RelativePath)]).optional(),
  skills: z.union([RelativePath, z.array(RelativePath)]).optional(),
  outputStyles: z.union([RelativePath, z.array(RelativePath)]).optional(),
  hooks: z
    .union([
      RelativeJSONPath,
      HooksSettingsSchema,
      z.array(z.union([RelativeJSONPath, HooksSettingsSchema])),
    ])
    .optional(),

  // MCP / LSP
  mcpServers: z
    .union([
      RelativeJSONPath,
      z.record(z.string(), McpServerConfigSchema),
      z.array(z.union([RelativeJSONPath, z.record(z.string(), McpServerConfigSchema)])),
    ])
    .optional(),
  lspServers: z
    .union([
      RelativeJSONPath,
      z.record(z.string(), z.unknown()),
      z.array(z.union([RelativeJSONPath, z.record(z.string(), z.unknown())])),
    ])
    .optional(),

  // Settings
  settings: z.record(z.string(), z.unknown()).optional(),
  userConfig: z.record(z.string(), PluginUserConfigOptionSchema).optional(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type ValidatedPluginManifest = z.infer<typeof PluginManifestSchema>;
export type ValidatedHookCommand = z.infer<typeof HookCommandSchema>;
export type ValidatedHookMatcher = z.infer<typeof HookMatcherSchema>;
