/**
 * Permission Checker — 权限检查器
 *
 * Supports three decisions per tool call:
 *   allow → proceed with execution
 *   deny  → return an error tool result immediately
 *   ask   → show a confirmation modal and wait for user input
 */

import { statSync } from "fs";
import { isPreapprovedDomain, isDangerousHost } from "../tools/webfetch-domains.js";

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRule {
  /** Match specific tool name, or omit to match all */
  toolName?: string;
  /** Regex to match against stringified args (e.g. command string) */
  pattern?: RegExp;
  /** Deny specific file paths (absolute or relative) */
  denyPaths?: string[];
  /** Result of this rule */
  decision: PermissionDecision;
  reason?: string;
}

export interface PermissionCheckResult {
  decision: PermissionDecision;
  reason?: string;
}

/**
 * Static Rule Data
 *
 * DANGEROUS_BASH_PATTERNS: commands that can destroy data or rewrite git history.
 * BLOCKED_PATHS: device/special files that should never be read or written.
 * SENSITIVE_FILE_PATTERNS: credentials, keys, env files — editing them requires confirmation.
 * Tool sets are grouped as constants so the default/fallback logic stays readable.
 */

const DANGEROUS_BASH_PATTERNS = [
  /\brm\s+-(rf|fr|r\s+f|f\s+r)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+clean\s+-[fd]\b/i,
  /\bgit\s+checkout\s+--\s+\.\b/i,
  /\bgit\s+restore\s+--\s+\.\b/i,
  /\b(git\s+stash\s+drop|git\s+stash\s+clear)\b/i,
  /\b(git\s+branch\s+-D|git\s+branch\s+--delete)\b/i,
  /\b(git\s+(commit|push|merge)\s+--no-verify)\b/i,
  /\b(git\s+commit\s+--amend)\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bkubectl\s+delete\b/i,
  /\bterraform\s+destroy\b/i,
];

const BLOCKED_PATHS = [
  "/dev/zero", "/dev/random", "/dev/urandom", "/dev/full",
  "/dev/stdin", "/dev/tty", "/dev/console", "/dev/stdout", "/dev/stderr",
];

const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i, /\.env\./i, /secret/i, /private.*key/i,
  /id_rsa/i, /id_ed25519/i, /\.ssh\//i, /credentials/i,
  /token/i, /password/i,
];

const ALWAYS_ALLOW_TOOLS = new Set(["taskCreate", "taskGet", "taskList", "taskUpdate"]);
const PATH_TOOLS = new Set(["read", "bash", "edit", "write"]);
const DESTRUCTIVE_TOOLS = new Set(["bash", "write"]);
const WRITE_TOOLS = new Set(["edit", "write"]);

/**
 * String & Path Helpers
 *
 * stringifyArgs normalizes tool arguments so regex rules can match against a plain string.
 * extractPath is a convenience helper because different tools use "path" vs "file_path" keys.
 */

export function isDangerousBashCommand(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((p) => p.test(command));
}

function stringifyArgs(toolName: string, args: unknown): string {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const obj = args as Record<string, unknown>;
    if (toolName === "bash" && typeof obj["command"] === "string") return obj["command"];
    if (typeof obj["path"] === "string") return obj["path"];
    if (typeof obj["file_path"] === "string") return obj["file_path"];
    return JSON.stringify(args);
  }
  return String(args);
}

function matchesBlockedPath(path: string): boolean {
  const normalized = path.toLowerCase().replace(/\\/g, "/");
  return BLOCKED_PATHS.some((blocked) => normalized.startsWith(blocked.toLowerCase()));
}

function isSensitiveFile(path: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((p) => p.test(path));
}

function extractPath(args: unknown): string | undefined {
  const obj = args as Record<string, unknown> | undefined;
  if (typeof obj?.["path"] === "string") return obj["path"];
  if (typeof obj?.["file_path"] === "string") return obj["file_path"];
  return undefined;
}

/**
 * Tool-Specific Checkers
 *
 * Each checker returns a PermissionCheckResult when it matches, or null to let the next checker run.
 * They are evaluated in order (toolCheckers array below) — first match wins.
 */

type ToolChecker = (toolName: string, args: unknown, argStr: string) => PermissionCheckResult | null;

/** Blocks access to device/special paths (e.g. /dev/zero) for read/bash/edit/write tools. */
const checkBlockedPaths: ToolChecker = (toolName, args) => {
  if (!PATH_TOOLS.has(toolName)) return null;
  const path = extractPath(args);
  if (path && matchesBlockedPath(path)) {
    return { decision: "deny", reason: `Access to device/special path blocked: ${path}` };
  }
  return null;
};

/** Flags destructive bash commands (rm -rf, git reset --hard, DROP TABLE, etc.) for confirmation. */
const checkDangerousBash: ToolChecker = (toolName, _args, argStr) => {
  if (toolName !== "bash") return null;
  if (isDangerousBashCommand(argStr)) {
    return {
      decision: "ask",
      reason: `Destructive command detected: "${argStr.trim()}". Confirm to proceed.`,
    };
  }
  return null;
};

/** Requires confirmation before editing credentials, keys, or .env files. */
const checkSensitiveFiles: ToolChecker = (toolName, args) => {
  if (!WRITE_TOOLS.has(toolName)) return null;
  const path = extractPath(args);
  if (path && isSensitiveFile(path)) {
    return { decision: "ask", reason: `Editing sensitive file: ${path}. Confirm to proceed.` };
  }
  return null;
};

/** Asks before reading files larger than 1 GiB (to avoid accidental OOM / long blocks). */
const checkLargeFileRead: ToolChecker = (toolName, args) => {
  if (toolName !== "read") return null;
  const path = extractPath(args);
  if (!path) return null;
  try {
    const stats = statSync(path);
    if (stats.size > 1024 * 1024 * 1024) {
      return { decision: "ask", reason: `File is very large (${(stats.size / 1024 / 1024).toFixed(0)} MiB). Confirm to read.` };
    }
  } catch {
    return { decision: "ask", reason: `Unable to verify file size for ${path}. Confirm to read.` };
  }
  return null;
};

/** Blocks dangerous hosts (localhost, IPs) and asks for non-preapproved domains. */
const checkWebFetch: ToolChecker = (_toolName, args) => {
  const url = (args as Record<string, unknown>)?.["url"];
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (isDangerousHost(hostname)) {
      return { decision: "deny", reason: `Access to local/IP/internal host blocked: ${hostname}` };
    }
    if (!isPreapprovedDomain(url)) {
      return { decision: "ask", reason: `Fetching from non-preapproved domain: ${hostname}. Confirm to proceed.` };
    }
  } catch {
    return { decision: "deny", reason: "Invalid URL format" };
  }
  return null;
};

const toolCheckers: ToolChecker[] = [
  checkBlockedPaths,
  checkDangerousBash,
  checkSensitiveFiles,
  checkLargeFileRead,
  checkWebFetch,
];

/**
 * Main API
 *
 * Evaluates toolCheckers in order. If none match:
 *   • read-only tools → allow
 *   • destructive tools (bash, write) → ask
 *   • edit → allow (already vetted by checkSensitiveFiles if needed)
 */

/**
 * Check permission for a tool call.
 *
 * Rules are evaluated in order; the first matching rule wins.
 * If no rule matches, destructive tools default to "ask",
 * read-only tools default to "allow".
 */
export function checkPermission(
  toolName: string,
  args: unknown,
  _customRules?: PermissionRule[]
): PermissionCheckResult {
  // Task management tools are in-memory only — no permission needed
  if (ALWAYS_ALLOW_TOOLS.has(toolName)) {
    return { decision: "allow" };
  }

  const argStr = stringifyArgs(toolName, args);

  for (const checker of toolCheckers) {
    const result = checker(toolName, args, argStr);
    if (result) return result;
  }

  // Default: read-only allow, destructive ask
  const isDestructive = DESTRUCTIVE_TOOLS.has(toolName);
  if (isDestructive) {
    return { decision: "ask", reason: `${toolName} is a destructive operation. Confirm to proceed.` };
  }
  return { decision: "allow" };
}
