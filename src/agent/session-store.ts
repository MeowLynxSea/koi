/**
 * Koi Session Store
 *
 * Manages multiple AgentSessions: listing, creating, loading, switching, and
 * persisting Koi-specific per-session UI state (UIMessage[], collapsed states).
 * Builds on top of Pi's SessionManager for underlying JSONL persistence.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createAgentSession, SessionManager, defineTool, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import type { AgentSession, CreateAgentSessionResult, SessionInfo, ToolDefinition, Skill, ResourceDiagnostic } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { UIMessage } from "../tui/components/chat-panel.js";
import type { ModelRef } from "../config/settings.js";
import {
  getPiAuthStorage,
  getPiModelRegistry,
  getPiSettingsManager,
  getCurrentPiModel,
} from "../config/settings.js";
import { createCodingToolDefinitions } from "../tools/index.js";
import type { SessionTaskManager } from "./session-tasks.js";
import { forkManager } from "./session-fork.js";
import {
  initializeMcpConnections,
  disconnectAllMcpServers,
  getAllMcpTools,
  getMcpConnection,
  type McpProgressCallback,
} from "../services/mcp/index.js";
import { getActiveToolNamesForMode } from "./mode.js";
import {
  loadAllSkills,
  initBundledSkills,
  type SkillCommand,
} from "../skills/index.js";
import { createToolOutputGuard } from "./tool-output-guard.js";
import { getResolvedBootContent } from "../cce/index.js";
import { getNamespaceContext } from "../cce/agent-bridge/namespace-context.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "koi");
const KOI_SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const PI_AGENT_DIR = path.join(CONFIG_DIR, "pi");

export interface SessionMeta {
  id: string;
  title: string;
  filePath: string;
  cwd: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  /** Fork source session ID (null for original sessions) */
  forkedFrom: string | null;
  /** Depth in the fork tree (0 for original, incremented for each fork level) */
  forkDepth: number;
  /** List of session IDs that were forked from this session */
  childForks: string[];
}

export interface KoiSessionState {
  sessionId: string;
  title: string;
  currentModel: ModelRef | null;
  auxiliaryModel: ModelRef | null;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;

  // === Fork-related state ===
  /** Fork source session ID (null for original sessions) */
  forkedFrom: string | null;
  /** Branch ID at the fork point */
  forkBranchId: string | null;
  /** Timestamp when this session was forked */
  forkedAt: number | null;

  // === Agent mode state ===
  /** Current agent mode (build/ask/plan) */
  agentMode: "build" | "ask" | "plan";
  /** Active tool names for current mode */
  activeTools: string[];

  // === UI state ===
  /** IDs of expanded messages (thinking blocks) */
  expandedMessages: string[];
  /** IDs of collapsed messages (tool results) */
  collapsedMessages: string[];

  // === Subagent state ===
  /** Subagent entries for this session (persisted for session restore) */
  subagents: SubagentEntryState[];
}

/**
 * Persisted subagent entry (subset of AsyncSubagentEntry for storage)
 */
export interface SubagentEntryState {
  id: string;
  description: string;
  status: "running" | "completed" | "failed" | "killed";
  result?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * File System Helpers
 *
 * All fs operations are wrapped in safe* variants that swallow errors gracefully.
 * This avoids crashing the agent loop when ~/.config is read-only or a session file is corrupted.
 */

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getKoiSessionDir(sessionId: string): string {
  return path.join(KOI_SESSIONS_DIR, sessionId);
}

function getKoiStatePath(sessionId: string): string {
  return path.join(getKoiSessionDir(sessionId), "koi-state.json");
}

/**
 * Attachment Management Functions
 *
 * Handles saving and loading files/images/text pasted via Ctrl+V.
 * All attachments are stored in the session's attachments subdirectory.
 */

export function getAttachmentsDir(sessionId: string): string | null {
  try {
    const sessionDir = getKoiSessionDir(sessionId);
    const attachmentsDir = path.join(sessionDir, "attachments");
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true, mode: 0o700 });
    }
    return attachmentsDir;
  } catch {
    return null;
  }
}

export function saveAttachment(
  sessionId: string,
  type: "files" | "images" | "texts",
  fileName: string,
  data: Buffer | string
): string | null {
  const attachmentsDir = getAttachmentsDir(sessionId);
  if (!attachmentsDir) return null;

  try {
    const subDir = path.join(attachmentsDir, type);
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true, mode: 0o700 });
    }

    const filePath = path.join(subDir, fileName);
    fs.writeFileSync(filePath, data, { mode: 0o600 });
    return filePath;
  } catch {
    return null;
  }
}

export function getSessionId(sessionId: string | null): string | null {
  // This is a utility function to validate/return session ID
  // Used by paste-handler to ensure valid session context
  if (!sessionId) return null;
  
  // Verify session directory exists
  const sessionDir = getKoiSessionDir(sessionId);
  return fs.existsSync(sessionDir) ? sessionId : null;
}

function safeReadFile<T>(path: string, parser: (raw: string) => T): T | null {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, "utf-8");
    return parser(raw);
  } catch {
    return null;
  }
}

function safeWriteFile(filePath: string, data: string): void {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, data, { mode: 0o600 });
  } catch {
    // Silently ignore write errors
  }
}

function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function safeDeleteDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * MCP Tool Definition Helpers
 * 
 * These functions convert MCP tools to Pi ToolDefinition format,
 * allowing MCP tools to be registered with the agent session.
 */

import type { TSchema } from "typebox";

// TypeBox schema builder that properly handles dynamic schemas
function convertJsonSchemaToTypeBox(schema: unknown): TSchema {
  if (!schema || typeof schema !== "object") {
    return Type.String();
  }
  
  const s = schema as Record<string, unknown>;
  const type = s["type"] as string | undefined;
  
  if (type === "string") return Type.String() as TSchema;
  if (type === "number" || type === "integer") return Type.Number() as TSchema;
  if (type === "boolean") return Type.Boolean() as TSchema;
  
  if (type === "array") {
    const itemsSchema = s["items"] ? convertJsonSchemaToTypeBox(s["items"]) : Type.String();
    return Type.Array([itemsSchema]) as TSchema;
  }
  
  if (type === "object") {
    const properties: Record<string, TSchema> = {};
    const props = s["properties"] as Record<string, unknown> | undefined;
    if (props && typeof props === "object") {
      for (const [key, value] of Object.entries(props)) {
        properties[key] = convertJsonSchemaToTypeBox(value);
      }
    }
    return Type.Object(properties) as TSchema;
  }
  
  return Type.String() as TSchema;
}

function createMcpToolDefinitions(): ToolDefinition[] {
  const mcpTools = getAllMcpTools();
  return mcpTools.map((tool) => {
    const serverName = tool.serverName ?? "unknown";
    const originalToolName = tool.originalToolName ?? tool.name;
    
    // Create a TypeBox schema from the input schema
    const inputSchema = tool.inputSchema || {};
    const properties: Record<string, TSchema> = {};
    
    if (typeof inputSchema === "object" && inputSchema !== null) {
      const schema = inputSchema as Record<string, unknown>;
      
      const schemaProps = schema["properties"] as Record<string, unknown> | undefined;
      if (schemaProps && typeof schemaProps === "object") {
        for (const [key, value] of Object.entries(schemaProps)) {
          properties[key] = convertJsonSchemaToTypeBox(value);
        }
      }
    }
    
    const typeboxSchema = Type.Object(properties, {
      additionalProperties: true,
    });
    
    return defineTool({
      name: tool.name,
      label: `${serverName}: ${originalToolName}`,
      description: tool.description || `MCP tool from ${serverName}`,
      parameters: typeboxSchema,
      // @ts-expect-error - execute signature compatibility with dynamic tools
      execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
        try {
          const connection = getMcpConnection(serverName);
          if (!connection || connection.status !== "connected") {
            return {
              content: [{ type: "text" as const, text: `MCP server '${serverName}' is not connected` }],
              isError: true,
            };
          }
          
          const result = await connection.client.callTool({
            name: originalToolName ?? "",
            arguments: params as Record<string, unknown>,
          });
          
          return {
            content: result.content as Array<{ type: string; text?: string; [key: string]: unknown }>,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true,
          };
        }
      },
    });
  });
}

/**
 * Session Helpers
 *
 * SessionConfig collects the cross-cutting dependencies (auth, registry, settings, tools)
 * needed by every createAgentSession call so create/load/continue can share one code path.
 */

function sessionInfoToMeta(info: SessionInfo): SessionMeta {
  const forkMeta = forkManager.getForkMetadata(info.id);

  // Ensure valid dates with fallbacks to prevent rendering issues
  const createdAt =
    info.created instanceof Date && !isNaN(info.created.getTime())
      ? info.created
      : new Date();
  const updatedAt =
    info.modified instanceof Date && !isNaN(info.modified.getTime())
      ? info.modified
      : new Date();

  // Ensure messageCount is a valid number
  const messageCount =
    typeof info.messageCount === "number" && info.messageCount >= 0
      ? info.messageCount
      : 0;

  return {
    id: info.id,
    title: info.name || info.firstMessage || "Untitled Session",
    filePath: info.path,
    cwd: info.cwd ?? "",
    createdAt,
    updatedAt,
    messageCount,
    // Fork-related fields
    forkedFrom: forkMeta?.sourceSessionId ?? null,
    forkDepth: forkMeta ? forkManager.getForkDepth(info.id) : 0,
    childForks: forkManager.getChildForks(info.id),
  };
}

interface SessionConfig {
  authStorage: ReturnType<typeof getPiAuthStorage>;
  modelRegistry: ReturnType<typeof getPiModelRegistry>;
  settingsManager: ReturnType<typeof getPiSettingsManager>;
  currentModel: ReturnType<typeof getCurrentPiModel>;
  customTools: ToolDefinition[];
  skills: Skill[];
}

/**
 * Convert Koi's SkillCommand to Pi's Skill format for injection into the session.
 */
function convertKoiSkillsToPiSkills(skillCommands: SkillCommand[]): Skill[] {
  return skillCommands
    .filter((cmd) => !cmd.disableModelInvocation)
    .map((cmd) => {
      const filePath = cmd.skillRoot 
        ? path.join(cmd.skillRoot, "SKILL.md")
        : `koi://bundled-skills/${cmd.name}`;
      
      const baseDir = cmd.skillRoot || "";
      
      return {
        name: cmd.name,
        description: cmd.description,
        filePath,
        baseDir,
        sourceInfo: {
          path: filePath,
          source: cmd.loadedFrom === "bundled" ? "koi-bundled" : "koi",
          scope: cmd.source === "projectSettings" ? "project" : "user",
          origin: "top-level",
          baseDir,
        },
        disableModelInvocation: cmd.disableModelInvocation,
      };
    });
}

async function buildSessionConfig(taskManager: SessionTaskManager, onMcpProgress?: McpProgressCallback): Promise<SessionConfig> {
  // Initialize MCP connections to get tool definitions (with progress callback)
  await disconnectAllMcpServers();
  await initializeMcpConnections({ onProgressUpdate: onMcpProgress });
  
  // Create MCP tool definitions
  const mcpToolDefs = createMcpToolDefinitions();
  
  // Combine coding tools with MCP tools
  const codingTools = createCodingToolDefinitions(process.cwd(), taskManager);
  
  // CCE tools are only available if the user has already enabled & initialized CCE
  // (lazy-loaded via the CCE modal, not blocking session creation)
  const cceTools = await (async () => {
    try {
      const { getCceSystem, createCceToolDefinitions } = await import("../cce/index.js");
      const cce = getCceSystem();
      if (!cce) return [];
      return createCceToolDefinitions({
        graph: cce.graph,
        search: cce.search,
        glossary: cce.glossary,
        activation: cce.activation,
        wm: cce.wm,
        associative: cce.associative,
      });
    } catch (err) {
      console.error("[CCE] Failed to load tools:", err);
      return [];
    }
  })();
  
  // Initialize bundled skills and load all skills
  initBundledSkills();
  const koiSkillCommands = await loadAllSkills(process.cwd());
  const piSkills = convertKoiSkillsToPiSkills(koiSkillCommands);
  
  // Debug log
  const logPath = "/tmp/koi-session-debug.log";
  const logLine = `[${new Date().toISOString()}] buildSessionConfig: loaded ${koiSkillCommands.length} skills, ${piSkills.length} after filter\n`;
  try { fs.appendFileSync(logPath, logLine); } catch {}
  
  return {
    authStorage: getPiAuthStorage(),
    modelRegistry: getPiModelRegistry(),
    settingsManager: getPiSettingsManager(),
    currentModel: getCurrentPiModel(),
    customTools: [...codingTools, ...mcpToolDefs, ...cceTools],
    skills: piSkills,
  };
}

/**
 * Tool Abort Support
 * 
 * Wraps all tool definitions with abort signal support.
 * When Ctrl+C is pressed, the abort signal is set, and any wrapped tool
 * will immediately return "User interrupted tool use." instead of continuing.
 * 
 * This uses Promise.race to ensure tools can be interrupted at any point,
 * even if they don't explicitly check the signal.
 */

/** Sentinel error used to cancel tool execution via Promise.race */
class ToolAbortError extends Error {
  constructor() {
    super("Tool execution aborted");
    this.name = "ToolAbortError";
  }
}

/** Wraps a tool definition to support abort signal checking. */
function wrapToolWithAbortSupport<TParams extends Type.TSchema, TDetails>(
  tool: ToolDefinition<TParams, TDetails>
): ToolDefinition<TParams, TDetails> {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Immediately check if signal is already aborted
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "User interrupted tool use." }],
          details: {} as TDetails,
          isError: true,
        };
      }

      // Create a promise that resolves when abort is signaled
      const abortPromise = new Promise<never>((_, reject) => {
        if (signal) {
          const abortHandler = () => {
            reject(new ToolAbortError());
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      });

      // Race the tool execution against the abort signal
      try {
        return await Promise.race([
          tool.execute(toolCallId, params, signal, onUpdate, ctx),
          abortPromise,
        ]);
      } catch (error) {
        if (error instanceof ToolAbortError) {
          return {
            content: [{ type: "text", text: "User interrupted tool use." }],
            details: {} as TDetails,
            isError: true,
          };
        }
        throw error;
      }
    },
  };
}

/** Wraps all tools in an array with abort support. */
function wrapAllToolsWithAbortSupport(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => wrapToolWithAbortSupport(tool));
}

/**
 * Koi's custom system prompt section - Claude Code inspired guidelines
 * Injected via systemPromptOverride to customize the agent's behavior.
 */
const KOI_SYSTEM_PROMPT_SECTION = `

# Doing Tasks

- The user will primarily request software engineering tasks: solving bugs, adding functionality, refactoring, explaining code, and more.
- When given an unclear or generic instruction, consider it in the context of software engineering tasks and the current working directory.
- In general, do not propose changes to code you haven't read. If asked about or to modify a file, read it first.
- Do not create files unless absolutely necessary. Prefer editing existing files to prevent file bloat.
- Avoid giving time estimates for tasks. Focus on what needs to be done, not how long it might take.
- If an approach fails, diagnose why before switching tactics—read the error, check assumptions, try a focused fix.
- Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10).

# Code Style

- Don't add features, refactor code, or make "improvements" beyond what was asked.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen.
- Don't create helpers, utilities, or abstractions for one-time operations.
- Don't design for hypothetical future requirements.
- Don't add docstrings, comments, or type annotations to code you didn't change.
- Don't explain WHAT the code does—well-named identifiers already do that.
- Default to writing no comments. Only add one when the WHY is non-obvious.
- Avoid backwards-compatibility hacks like renaming unused _vars, re-exporting types.
- Before reporting task complete, verify it actually works: run tests, execute scripts, check output.

# Executing Actions with Care

Carefully consider reversibility and blast radius of actions. Generally you can freely take local, reversible actions like editing files or running tests.

For actions that are hard to reverse, affect shared systems, or could be risky or destructive, check with the user before proceeding:

Examples requiring confirmation:
- Destructive operations: deleting files/branches, dropping tables, killing processes, rm -rf
- Hard-to-reverse: force-pushing, git reset --hard, amending commits, removing packages
- Actions visible to others: pushing code, creating/closing PRs, sending messages
- Uploading content to third-party services

When encountering an obstacle, do not use destructive actions as a shortcut. Investigate before deleting or overwriting.

# Using Your Tools

- To read files use read instead of cat, head, tail, or sed
- To edit files use edit instead of sed or awk
- To create files use write instead of cat with heredoc or echo redirection
- To search for files use glob instead of find or ls
- To search content use grep instead of grep or rg
- Reserve bash exclusively for system commands requiring shell execution
- Call multiple independent tools in parallel when possible
- Break down and manage work with task tools. Mark tasks completed as soon as done.

# Output Style

- Be concise. Go straight to the point. Lead with the answer or action.
- Keep text output brief and direct. Skip filler words, preamble, and unnecessary transitions.
- When referencing functions or code include the pattern file_path:line_number.
- Do not use a colon before tool calls.
- Only use emojis if the user explicitly requests it.
- Focus text output on: decisions needing user input, high-level status updates, errors or blockers.

# Paste Attachments

When the user pastes files, images, or large text via Ctrl+V/Command+V:

1. **Files**: Sent as [File:path] - the file has been saved to the session folder. Read the file content using the file path provided.
2. **Images**: Sent as [Image:path] - the image has been saved to the session folder. Use appropriate tools to analyze or process the image.
3. **Long text**: Sent as Text:path - text exceeding 5000 characters has been saved to the session folder. Read the file content using the path provided.

Always use the read tool to access the actual content of pasted files, images, or long text when needed.

# Cat's Context Engine (CCE)

You have access to a built-in long-term memory system called Cat's Context Engine (CCE). It stores knowledge across sessions in a graph of code://, concept://, memory://, and system:// nodes.

Key principles:
- CCE is your long-term memory, not an external database. When you read from it, you are "remembering."
- Working Memory (12 slots) is automatically injected into your context each turn via <koi_context> tags. You do NOT need to call any tool to inspect or initialize it—this happens automatically.
- You do NOT need to manually search for context before every reply. Relevant memories are already pushed into your prompt automatically.
- **Write aggressively. It is far better to record something and later refine or delete it than to let a valuable insight vanish.** When in doubt, write it down.
- After making code changes, update concept:// and memory:// nodes to keep your architectural understanding in sync. Outdated context is worse than no context.
- If the user corrects you, locate the relevant context node and fix it immediately—don't just apologize.
- Use write_context to create or update concept:// and memory:// nodes when you gain durable insights.
- Use commit_insight to capture insights that are tightly related to the current conversation—it auto-links to all active Working Memory nodes.
- Use fuzzySearch to find nodes when you are unsure of the URI.
- Use link_context to connect related concepts so they activate together in future turns.
- Use manage_boot_links to add, remove, or list memory nodes linked to boot.
- code:// nodes are auto-maintained by the background sync engine. Do not manually create or update code:// nodes.
`

async function createAgentSessionWithConfig(
  sessionManager: ReturnType<typeof SessionManager.create>,
  config: SessionConfig
): Promise<CreateAgentSessionResult> {
  const skillDiagnostics: ResourceDiagnostic[] = [];
  
  // Create resource loader with Koi skills injected and custom system prompt
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    settingsManager: config.settingsManager,
    noSkills: true,
    skillsOverride: () => ({
      skills: config.skills,
      diagnostics: skillDiagnostics,
    }),
    // Override system prompt to inject Koi's custom guidelines
    systemPromptOverride: (baseSystemPrompt) => {
      // Replace the default "pi" identity with Koi's identity
      const koiIdentity = `You are Koi, an expert coding assistant built on the Pi coding agent framework. You help users by reading files, executing commands, editing code, and writing new files.

You are highly capable and often allow users to complete ambitious tasks that would otherwise be too complex or take too long. Defer to user judgment about whether a task is too large to attempt.`;
      
      // Handle potentially undefined baseSystemPrompt
      const base = baseSystemPrompt ?? "";
      
      // Replace the old identity line
      let newPrompt = base.replace(
        /You are an expert coding assistant operating inside pi, a coding agent harness\.?/,
        koiIdentity
      );
      
      // If replacement didn't happen, prepend Koi's identity at the start
      if (newPrompt === base) {
        newPrompt = koiIdentity + "\n\n" + base;
      }
      
      // ─── Inject CCE Boot Memory Links (synchronous cache) ───
      try {
        const namespace = getNamespaceContext().current;
        const bootContent = getResolvedBootContent(namespace);
        if (bootContent) {
          newPrompt += "\n\n=== Boot Memory Links ===\n\n" + bootContent;
        }
      } catch {
        // CCE not ready or boot memory not found — continue without it
      }
      
      // Append Koi's custom guidelines
      return newPrompt + KOI_SYSTEM_PROMPT_SECTION;
    },
  });
  await resourceLoader.reload();
  
  // Debug log
  const logPath = "/tmp/koi-session-debug.log";
  const logLine = `[${new Date().toISOString()}] createAgentSessionWithConfig: injecting ${config.skills.length} skills into session\n`;
  try { fs.appendFileSync(logPath, logLine); } catch {}
  
  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir: PI_AGENT_DIR,
    authStorage: config.authStorage,
    modelRegistry: config.modelRegistry,
    settingsManager: config.settingsManager,
    model: config.currentModel,
    noTools: "builtin",
    customTools: wrapAllToolsWithAbortSupport(config.customTools),
    sessionManager,
    resourceLoader,
  });

  // Install tool output guard to prevent context overflow from large tool results
  const afterToolCall = createToolOutputGuard();
  result.session.agent.afterToolCall = afterToolCall;

  return result;
}

/**
 * Public API
 *
 * createNewSession / loadSession / continueRecentSession all share the same boot sequence:
 *   buildSessionConfig → createAgentSessionWithConfig → (optionally save initial state)
 * listSessions converts Pi SessionInfo objects into Koi's SessionMeta shape.
 */

export async function listSessions(): Promise<SessionMeta[]> {
  try {
    // Clear fork manager cache to ensure fresh data
    forkManager.clearCache();
    const infos = await SessionManager.listAll();
    return infos.map(sessionInfoToMeta);
  } catch {
    return [];
  }
}

export async function createNewSession(
  taskManager: SessionTaskManager,
  onMcpProgress?: McpProgressCallback
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);
  const config = await buildSessionConfig(taskManager, onMcpProgress);
  const sessionManager = SessionManager.create(process.cwd());
  const result = await createAgentSessionWithConfig(sessionManager, config);

  const now = Date.now();
  // Get active tools for build mode, which includes MCP tools
  const activeTools = getActiveToolNamesForMode("build");
  
  const state: KoiSessionState = {
    sessionId: result.session.sessionId,
    title: "New Session",
    currentModel: config.currentModel ? { provider: config.currentModel.provider, modelId: config.currentModel.id } : null,
    auxiliaryModel: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
    // Fork-related state (null for new sessions)
    forkedFrom: null,
    forkBranchId: null,
    forkedAt: null,
    // Agent mode state (defaults for new sessions)
    agentMode: "build",
    activeTools,
    // UI state
    expandedMessages: [],
    collapsedMessages: [],
    // Subagent state (empty for new sessions)
    subagents: [],
  };
  saveKoiState(result.session.sessionId, state);
  return result;
}

export async function loadSession(
  filePath: string,
  taskManager: SessionTaskManager,
  onMcpProgress?: McpProgressCallback
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);
  const config = await buildSessionConfig(taskManager, onMcpProgress);
  const sessionManager = SessionManager.open(filePath, undefined, process.cwd());
  return createAgentSessionWithConfig(sessionManager, config);
}

export async function continueRecentSession(
  taskManager: SessionTaskManager
): Promise<CreateAgentSessionResult> {
  ensureDir(KOI_SESSIONS_DIR);
  const config = await buildSessionConfig(taskManager);
  const sessionManager = SessionManager.continueRecent(process.cwd());
  return createAgentSessionWithConfig(sessionManager, config);
}

export function saveKoiState(sessionId: string, state: KoiSessionState): void {
  safeWriteFile(getKoiStatePath(sessionId), JSON.stringify(state, null, 2) + "\n");
}

export function loadKoiState(sessionId: string): KoiSessionState | null {
  return safeReadFile(getKoiStatePath(sessionId), (raw) => JSON.parse(raw) as KoiSessionState);
}

export function deleteKoiSessionData(sessionId: string): void {
  safeDeleteDir(getKoiSessionDir(sessionId));
}

export async function deleteSession(meta: SessionMeta): Promise<void> {
  safeDeleteFile(meta.filePath);
  deleteKoiSessionData(meta.id);
}

/**
 * Message Builders
 *
 * extractUserContent / extractAssistantContent normalize Pi's message content unions
 * (string | TextBlock[] | ThinkingBlock[]) into plain strings for the TUI fallback path.
 *
 * buildUIMessagesFromAgentSession is a best-effort reconstruction used when koi-state.json
 * is missing (e.g. the user deleted it or opened the session on a different machine).
 */

function stripKoiContext(content: string): string {
  return content.replace(/<koi_context>[\s\S]*?<\/koi_context>/g, "").trimEnd();
}

function extractUserContent(content: unknown): string {
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((c): c is { type: "text"; text: string } =>
        typeof c === "object" && c !== null && "type" in c && (c as Record<string, unknown>)["type"] === "text"
      )
      .map((c) => c.text)
      .join("");
  }
  return stripKoiContext(text);
}

function extractAssistantContent(msg: { content: unknown[] }): { text: string; thinking: string } {
  let text = "";
  let thinking = "";
  for (const block of msg.content) {
    if (typeof block !== "object" || block === null) continue;
    const type = (block as Record<string, unknown>)["type"];
    if (type === "text") {
      text += String((block as Record<string, unknown>)["text"] ?? "");
    } else if (type === "thinking" && "thinking" in block) {
      thinking += String((block as Record<string, unknown>)["thinking"] ?? "");
    }
  }
  return { text, thinking };
}

/**
 * Build UIMessage array from AgentSession.messages as a fallback when
 * koi-state.json is missing. This is a best-effort reconstruction.
 */
export function buildUIMessagesFromAgentSession(session: AgentSession): UIMessage[] {
  const uiMessages: UIMessage[] = [];

  for (const msg of session.messages) {
    if (msg.role === "user") {
      uiMessages.push({
        id: `user-${msg.timestamp}`,
        type: "user",
        content: extractUserContent(msg.content),
      });
    } else if (msg.role === "assistant") {
      const { text, thinking } = extractAssistantContent(msg as { content: unknown[] });
      uiMessages.push({
        id: `agent-${msg.timestamp}`,
        type: "agent",
        content: text,
        thinking: thinking || undefined,
        thinkingCollapsed: true,
      });
    } else if (msg.role === "custom" && (msg as unknown as Record<string, unknown>)["customType"] === "plan") {
      const rawContent = (msg as unknown as Record<string, unknown>)["content"];
      const content = typeof rawContent === "string"
        ? rawContent
        : extractUserContent(rawContent);
      uiMessages.push({
        id: `plan-${msg.timestamp}`,
        type: "plan",
        content,
      });
    }
    // tool_result messages are skipped in fallback reconstruction
  }

  // Ensure only the latest plan message is kept (old plans are replaced by new ones).
  const planIndices: number[] = [];
  for (let i = 0; i < uiMessages.length; i++) {
    if (uiMessages[i]!.type === "plan") {
      planIndices.push(i);
    }
  }
  if (planIndices.length > 1) {
    // Remove all but the last plan message.
    for (let i = planIndices.length - 2; i >= 0; i--) {
      uiMessages.splice(planIndices[i]!, 1);
    }
  }

  return uiMessages;
}

/**
 * Update subagent state in session storage.
 * This persists subagent changes to the session's koi-state.json.
 */
export function updateSubagentState(
  sessionId: string,
  subagents: SubagentEntryState[]
): void {
  const state = loadKoiState(sessionId);
  if (!state) {
    // If no state file exists, create one with the subagents
    const now = Date.now();
    const newState: KoiSessionState = {
      sessionId,
      title: "Untitled",
      currentModel: null,
      auxiliaryModel: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      forkedFrom: null,
      forkBranchId: null,
      forkedAt: null,
      agentMode: "build",
      activeTools: [],
      expandedMessages: [],
      collapsedMessages: [],
      subagents,
    };
    saveKoiState(sessionId, newState);
    return;
  }

  // Update only the subagents field
  state.subagents = subagents;
  state.updatedAt = Date.now();
  saveKoiState(sessionId, state);
}

/**
 * Load subagent state from session storage.
 * Returns empty array if no state or subagents exist.
 */
export function loadSubagentState(sessionId: string): SubagentEntryState[] {
  const state = loadKoiState(sessionId);
  if (!state) return [];
  return state.subagents ?? [];
}
