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
 * Error result for external editor operations
 */
export interface ExternalEditorError {
  code?: number;
  message: string;
}

/**
 * Callback type for external editor completion
 */
export type ExternalEditorCallback = (result: string | null, error?: ExternalEditorError) => void;

/**
 * Check if an editor command exists and is executable
 */
export function isEditorAvailable(editorPath: string): boolean {
  try {
    const parts = editorPath.trim().split(/\s+/);
    const cmd = parts[0]!;
    
    // Try to spawn the command with --version to check if it exists
    const result = spawn(cmd, ["--version"], {
      stdio: "pipe",
      timeout: 5000,
    });
    
    return new Promise<boolean>((resolve) => {
      result.on("close", (code) => {
        resolve(code === 0);
      });
      result.on("error", () => {
        resolve(false);
      });
      // Timeout fallback
      setTimeout(() => {
        try {
          result.kill();
        } catch {
          // Ignore kill errors
        }
        resolve(false);
      }, 5000);
    });
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Open an external editor with the given content.
 * Returns the edited content via callback, or null if cancelled/error.
 * Suspends the renderer before opening and resumes after closing.
 */
export function openExternalEditor(
  renderer: CliRenderer,
  editorPath: string,
  initialContent: string,
  onComplete: ExternalEditorCallback
): void {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `koi-prompt-${Date.now()}.txt`);
  let rendererResumed = false;

  // Helper to ensure renderer is resumed exactly once
  const resumeRenderer = () => {
    if (!rendererResumed) {
      rendererResumed = true;
      try {
        renderer.resume();
      } catch {
        // Ignore resume errors
      }
    }
  };

  // Helper to clean up temp file
  const cleanupTempFile = () => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  };

  // Helper to call onComplete and ensure cleanup
  const complete = (result: string | null, error?: ExternalEditorError) => {
    resumeRenderer();
    cleanupTempFile();
    onComplete(result, error);
  };

  try {
    // Write initial content to temp file
    fs.writeFileSync(tmpFile, initialContent, "utf-8");

    // Suspend the renderer to restore terminal state before launching editor
    renderer.suspend();

    // Parse editor command (support "code --wait" style commands)
    const parts = editorPath.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    // Spawn the editor process with inherited stdio so the editor
    // can access the terminal properly (important for VS Code, terminal editors, etc.)
    const child = spawn(cmd, [...args, tmpFile], {
      stdio: "inherit",
      // Use current process environment
      env: { ...process.env },
      // Set a reasonable timeout (30 seconds) in case editor hangs
    });

    // Set a timeout as a fallback (e.g., if editor hangs)
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore kill errors
      }
    }, 120000); // 2 minute timeout

    child.on("close", (code) => {
      clearTimeout(timeout);
      
      if (code === 0) {
        try {
          const result = fs.readFileSync(tmpFile, "utf-8");
          complete(result);
        } catch {
          complete(null, { message: "Failed to read edited file" });
        }
      } else {
        complete(null, {
          code: code ?? undefined,
          message: `Editor exited with code ${code}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      complete(null, {
        message: `Failed to launch editor: ${err.message}. Make sure "${cmd}" is installed and in your PATH.`,
      });
    });

  } catch (err) {
    // Handle synchronous errors (e.g., file system errors, spawn errors)
    complete(null, {
      message: `Failed to start external editor: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
