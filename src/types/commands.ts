/**
 * Command System Types
 *
 * Defines the command interface for Koi's command palette.
 */

/**
 * Command context passed to command actions
 */
export interface CommandContext {
  cwd: string;
  session: unknown;
  onOpenSkillsModal?: () => void;
  onOpenMCPSettings?: () => void;
  onSwitchSession?: () => void;
  onNewSession?: () => void;
  onOpenModelModal?: () => void;
  onOpenConnectModal?: () => void;
  onFork?: () => void;
  onCompact?: () => void;
  onRename?: () => void;
}

/**
 * Command action result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Command definition
 */
export interface Command {
  /** Unique command identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description shown in command palette */
  description: string;
  /** Search keywords */
  keywords?: string[];
  /** Command action */
  action: (context: CommandContext) => Promise<CommandResult> | CommandResult;
  /** Whether the command requires an active session */
  requiresSession?: boolean;
  /** Whether to show in command palette */
  hidden?: boolean;
}

/**
 * Command group for organization
 */
export interface CommandGroup {
  id: string;
  name: string;
  commands: Command[];
}

/**
 * Built-in command IDs
 */
export const BUILTIN_COMMANDS = {
  SKILLS: "skills",
  NEW_SESSION: "new-session",
  FORK: "fork",
  SESSIONS: "sessions",
  COMPACT: "compact",
  RENAME: "rename",
  CONNECT: "connect",
  MODEL: "model",
  MCP: "mcp",
  YOLO: "yolo",
  MODE: "mode",
  PLAN: "plan",
} as const;

export type BuiltinCommandId = (typeof BUILTIN_COMMANDS)[keyof typeof BUILTIN_COMMANDS];
