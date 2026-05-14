/**
 * Hook to manage the CCE web server lifecycle from the TUI.
 */

import { useState, useCallback, useRef } from "react";

interface CceServerState {
  running: boolean;
  url: string | null;
  error: string | null;
}

let globalServer: ReturnType<typeof Bun.serve> | null = null;
let globalUrl: string | null = null;

export function useCceServer(): {
  state: CceServerState;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [state, setState] = useState<CceServerState>({ running: false, url: null, error: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  const start = useCallback(async () => {
    console.error("[CCE] start() called");
    if (globalServer) {
      setState({ running: true, url: globalUrl, error: null });
      return;
    }

    try {
      // Dynamically import to avoid loading on startup if not needed
      console.error("[CCE] importing server module...");
      const { createCceWebServer } = await import("../../../cce/web/server.js");
      console.error("[CCE] module imported successfully");
      const port = await findFreePort(8456);
      const server = createCceWebServer(port);
      globalServer = server;
      globalUrl = `http://localhost:${port}`;
      setState({ running: true, url: globalUrl, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ running: false, url: null, error: msg });
    }
  }, []);

  const stop = useCallback(() => {
    if (globalServer) {
      void globalServer.stop(true);
      globalServer = null;
      globalUrl = null;
    }
    setState({ running: false, url: null, error: null });
  }, []);

  return { state, start, stop };
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const server = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } }) as { stop: (force: boolean) => void } | null;
      if (server) {
        server.stop(true);
        return port;
      }
    } catch {
      // port in use, try next
    }
  }
  throw new Error("No free port found");
}
