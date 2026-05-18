/**
 * ACP Logger
 *
 * All logs go to stderr so stdout stays clean for ndjson protocol traffic.
 */

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

type LogLevel = keyof typeof LEVELS;

const currentLevel: LogLevel =
  (process.env["KOI_ACP_LOG_LEVEL"] as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [ACP:${level.toUpperCase()}]`;
  console.error(prefix, ...args);
}

export const acpLogger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};
