declare module "cross-spawn" {
  import type { ChildProcess } from "node:child_process";

  interface SpawnOptions {
    cwd?: string | URL;
    env?: Record<string, unknown>;
    argv0?: string;
    stdio?: "pipe" | "ignore" | "inherit" | Array<"pipe" | "ignore" | "inherit" | "ipc" | number>;
    shell?: boolean | string;
    windowsHide?: boolean;
    windowsVerbatimArguments?: boolean;
    detached?: boolean;
    uid?: number;
    gid?: number;
  }

  interface SpawnReturns extends ChildProcess {
    pid: number;
  }

  function spawn(command: string, args?: string[], options?: SpawnOptions): SpawnReturns;

  export = spawn;
}
