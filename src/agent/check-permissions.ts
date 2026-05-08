/**
 * Permission Checker — 权限检查器
 *
 * Supports three decisions per tool call:
 *   allow → proceed with execution
 *   deny  → return an error tool result immediately
 *   ask   → show a confirmation modal and wait for user input
 */

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

// Dangerous bash command patterns
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

// Blocked device / dangerous paths
const BLOCKED_PATHS = [
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/tty",
  "/dev/console",
  "/dev/stdout",
  "/dev/stderr",
];

// Sensitive file patterns
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /secret/i,
  /private.*key/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.ssh\//i,
  /credentials/i,
  /token/i,
  /password/i,
];

function stringifyArgs(toolName: string, args: unknown): string {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const obj = args as Record<string, unknown>;
    if (toolName === "bash" && typeof obj.command === "string") return obj.command;
    if (typeof obj.path === "string") return obj.path;
    if (typeof obj.file_path === "string") return obj.file_path;
    return JSON.stringify(args);
  }
  return String(args);
}

function matchesBlockedPath(path: string): boolean {
  const normalized = path.toLowerCase().replace(/\\/g, "/");
  for (const blocked of BLOCKED_PATHS) {
    if (normalized.startsWith(blocked.toLowerCase())) return true;
  }
  return false;
}

function isSensitiveFile(path: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((p) => p.test(path));
}

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
  const argStr = stringifyArgs(toolName, args);

  // Task management tools are in-memory only — no permission needed
  if (toolName === "taskCreate" || toolName === "taskGet" || toolName === "taskList" || toolName === "taskUpdate") {
    return { decision: "allow" };
  }

  // 1. Blocked paths (device files)
  if (toolName === "read" || toolName === "bash" || toolName === "edit" || toolName === "write") {
    const path = (args as Record<string, unknown>)?.path ?? (args as Record<string, unknown>)?.file_path;
    if (typeof path === "string" && matchesBlockedPath(path)) {
      return { decision: "deny", reason: `Access to device/special path blocked: ${path}` };
    }
  }

  // 2. Dangerous bash commands
  if (toolName === "bash") {
    for (const pattern of DANGEROUS_BASH_PATTERNS) {
      if (pattern.test(argStr)) {
        return {
          decision: "ask",
          reason: `Destructive command detected: "${argStr.trim()}". Confirm to proceed.`,
        };
      }
    }
  }

  // 3. Sensitive files for edit/write
  if (toolName === "edit" || toolName === "write") {
    const path = (args as Record<string, unknown>)?.path ?? (args as Record<string, unknown>)?.file_path;
    if (typeof path === "string" && isSensitiveFile(path)) {
      return {
        decision: "ask",
        reason: `Editing sensitive file: ${path}. Confirm to proceed.`,
      };
    }
  }

  // 4. Large file reads (> 1 GiB) — ask
  if (toolName === "read") {
    const path = (args as Record<string, unknown>)?.path;
    if (typeof path === "string") {
      try {
        const { statSync } = require("fs");
        const stats = statSync(path);
        if (stats.size > 1024 * 1024 * 1024) {
          return { decision: "ask", reason: `File is very large (${(stats.size / 1024 / 1024).toFixed(0)} MiB). Confirm to read.` };
        }
      } catch {
        // ignore stat errors
      }
    }
  }

  // 5. WebFetch: dangerous hosts → deny, non-preapproved → ask
  if (toolName === "webfetch") {
    const url = (args as Record<string, unknown>)?.url;
    if (typeof url === "string") {
      const { isPreapprovedDomain, isDangerousHost } = require("../tools/webfetch-domains.js");
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
    }
  }

  // Default: read-only allow, write ask if destructive
  const meta =
    toolName === "bash" || toolName === "edit" || toolName === "write"
      ? { isReadOnly: false, isDestructive: toolName !== "edit" }
      : { isReadOnly: true, isDestructive: false };

  if (meta.isReadOnly) {
    return { decision: "allow" };
  }
  if (meta.isDestructive) {
    return { decision: "ask", reason: `${toolName} is a destructive operation. Confirm to proceed.` };
  }
  return { decision: "allow" };
}
