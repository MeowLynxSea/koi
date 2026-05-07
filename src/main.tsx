/**
 * Koi - Main Entry Point
 *
 * Bootstraps the Ink-based TUI application.
 */

import React from "react";
import { render } from "ink";
import { App } from "./tui/app.js";

export async function main(): Promise<void> {
  render(<App />, { exitOnCtrlC: false });

  // Keep process alive until exit
  await new Promise(() => {});
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
