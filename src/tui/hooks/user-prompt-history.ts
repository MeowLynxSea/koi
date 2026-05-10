/**
 * User Prompt History Hook
 *
 * Global, session-independent history for user-sent messages.
 * Filters out internal notifications (Monitor, background agent messages).
 * Maximum 100 entries. Persisted to ~/.config/koi/prompt-history.json
 */

import fs from "fs";
import path from "path";
import os from "os";

const MAX_HISTORY_SIZE = 100;
const HISTORY_FILE = path.join(os.homedir(), ".config", "koi", "prompt-history.json");

// Global shared history - persists across all sessions
let userPromptHistory: string[] = [];

/**
 * Get the directory for storing history file.
 */
function getHistoryDir(): string {
  return path.dirname(HISTORY_FILE);
}

/**
 * Load history from disk.
 */
function loadHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_HISTORY_SIZE);
      }
    }
  } catch (err) {
    // Ignore errors, return empty array
  }
  return [];
}

/**
 * Save history to disk.
 */
function saveHistory(history: string[]): void {
  try {
    const dir = getHistoryDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch (err) {
    // Ignore write errors
  }
}

// Load history on module initialization
userPromptHistory = loadHistory();

/**
 * Check if a message is an internal notification from Monitor or background agent.
 * These should not be added to user prompt history.
 */
export function isInternalUserMessage(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith("<task-notification>") ||
    trimmed.startsWith("<monitor-notification>")
  );
}

/**
 * Add a message to the user prompt history.
 * Only adds if not an internal notification.
 * Maintains maximum size of 100 entries.
 */
export function addToUserHistory(text: string): void {
  if (isInternalUserMessage(text)) {
    return;
  }

  // Avoid duplicates: if the same message is at the top, don't add it again
  if (userPromptHistory.length > 0 && userPromptHistory[0] === text) {
    return;
  }

  // Add to the beginning (most recent first)
  userPromptHistory.unshift(text);

  // Trim to max size
  if (userPromptHistory.length > MAX_HISTORY_SIZE) {
    userPromptHistory = userPromptHistory.slice(0, MAX_HISTORY_SIZE);
  }

  // Persist to disk
  saveHistory(userPromptHistory);
}

/**
 * Get the entire user prompt history.
 */
export function getUserHistory(): readonly string[] {
  return userPromptHistory;
}

/**
 * Clear all user prompt history.
 */
export function clearUserHistory(): void {
  userPromptHistory = [];
  saveHistory([]);
}
