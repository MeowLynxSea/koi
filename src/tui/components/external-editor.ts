/**
 * External Editor Utility
 *
 * Spawns an external editor process with a temporary file
 * containing the initial content, and returns the edited result.
 * Suspends the renderer before opening the editor and resumes it after.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type { CliRenderer } from "@opentui/core";

/**
 * Open an external editor with the given content.
 * Returns the edited content via callback, or null if cancelled/error.
 * Suspends the renderer before opening and resumes after closing.
 */
export function openExternalEditor(
  renderer: CliRenderer,
  editorPath: string,
  initialContent: string,
  onComplete: (result: string | null) => void
): void {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `koi-prompt-${Date.now()}.txt`);

  // Write initial content to temp file
  fs.writeFileSync(tmpFile, initialContent, "utf-8");

  // Suspend the renderer to restore terminal state before launching editor
  renderer.suspend();

  // Parse editor command (support "code --wait" style commands)
  const parts = editorPath.trim().split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);

  // Spawn the editor process
  const child = spawn(cmd, [...args, tmpFile], {
    stdio: "inherit",
  });

  child.on("close", (code) => {
    // Resume the renderer after the editor closes
    renderer.resume();

    try {
      if (code === 0) {
        const result = fs.readFileSync(tmpFile, "utf-8");
        onComplete(result);
      } else {
        onComplete(null);
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  child.on("error", () => {
    // Resume the renderer on error as well
    renderer.resume();

    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
    onComplete(null);
  });
}
