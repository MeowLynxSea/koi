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
import { refreshActivePlugins } from "./plugins/refresh.js";
import { emitSetup, emitStop, emitStopFailure } from "./hooks/integrations/lifecycleHooks.js";

export async function main(): Promise<void> {
  loadSettings();

  // Initialize plugin system
  refreshActivePlugins();

  // Fire Setup hooks
  await emitSetup();

  const renderer = await createCliRenderer({ exitOnCtrlC: false });

  // Enable bracketed paste mode so we can detect paste events
  process.stdout.write("\x1B[?2004h");

  createRoot(renderer).render(
    <DialogProvider>
      <App
        renderer={renderer}
        onExit={async () => {
          await emitStop();
          renderer.destroy();
          process.exit(0);
        }}
      />
    </DialogProvider>
  );

  // Ensure terminal state is restored on unexpected exits
  const cleanup = () => {
    try {
      // Disable bracketed paste mode before exit
      process.stdout.write("\x1B[?2004l");
      renderer.destroy();
    } catch {
      // ignore cleanup errors during shutdown
    }
  };
  const cleanupWithStop = async () => {
    await emitStop();
    cleanup();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    void cleanupWithStop().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void cleanupWithStop().then(() => process.exit(0));
  });
  process.on("uncaughtException", (err) => {
    void emitStopFailure(err.message).then(() => {
      cleanup();
      console.error(err);
      process.exit(1);
    });
  });
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    void emitStopFailure(msg).then(() => {
      cleanup();
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  });

  // Keep process alive until exit
  await new Promise(() => {});
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
