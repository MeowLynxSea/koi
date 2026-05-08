/**
 * Koi - Main Entry Point
 *
 * Bootstraps the OpenTUI React application.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { DialogProvider } from "@opentui-ui/dialog/react";
import { App } from "./tui/app.js";
import { loadSettings } from "./config/settings.js";

export async function main(): Promise<void> {
  loadSettings();
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  createRoot(renderer).render(
    <DialogProvider>
      <App
        onExit={() => {
          renderer.destroy();
          process.exit(0);
        }}
      />
    </DialogProvider>
  );

  // Ensure terminal state is restored on unexpected exits
  const cleanup = () => {
    try {
      renderer.destroy();
    } catch {
      // ignore cleanup errors during shutdown
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    cleanup();
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  });

  // Keep process alive until exit
  await new Promise(() => {});
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
