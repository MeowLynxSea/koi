/**
 * Koi - Main Entry Point
 *
 * Bootstraps the CLI argument parser and dispatches to the TUI or
 * non-interactive modes.
 */

import { ProcessTerminal, TUI, matchesKey } from "@mariozechner/pi-tui";
import { KoiApp } from "./tui/app.js";

const EXIT_TIMEOUT_MS = 2000;
const DEBOUNCE_MS = 150;

export async function main(): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, true);
  const app = new KoiApp(terminal, tui);

  tui.addChild(app);
  tui.setFocus(app.getEditor());

  // Double Ctrl+C to exit
  let exitPending = false;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerExit = () => {
    if (exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    tui.stop();
    process.exit(0);
  };

  const startExitPrompt = () => {
    exitPending = true;
    app.getInfoBar().setExitMode(true);
    tui.requestRender();
    exitTimer = setTimeout(() => {
      exitPending = false;
      app.getInfoBar().setExitMode(false);
      tui.requestRender();
      exitTimer = null;
    }, EXIT_TIMEOUT_MS);
  };

  // Handle Ctrl+C via input listener only (SIGINT is suppressed by raw mode)
  tui.addInputListener((data) => {
    if (matchesKey(data, "ctrl+c")) {
      // Debounce: ignore repeated Ctrl+C events within the debounce window.
      // Terminals may send press+release or auto-repeat sequences rapidly.
      if (debounceTimer) {
        return { consume: true };
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
      }, DEBOUNCE_MS);

      if (exitPending) {
        triggerExit();
      } else {
        startExitPrompt();
      }
      return { consume: true };
    }
    return undefined;
  });

  tui.start();

  // Keep process alive
  await new Promise(() => {});
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
