/**
 * MCP Stdio Transport with JSON Filtering
 * 
 * Some MCP servers (like context7) output non-JSON text to stdout on startup,
 * which would cause parsing errors. This wrapper filters out non-JSON lines.
 */

import spawn from "cross-spawn";
import process from "node:process";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

// Transport interface for FilteredStdioClientTransport
interface Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  start(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  readonly pid?: number | null;
}

// Inline serializeMessage to avoid internal path imports
function serializeMessage(message: JSONRPCMessage): string {
  return JSON.stringify(message) + "\n";
}

/**
 * Buffers a continuous stdio stream into discrete JSON-RPC messages.
 */
class ReadBuffer {
  private _buffer?: Buffer;

  append(chunk: Buffer): void {
    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
  }

  readMessage(): { line: string; remaining: Buffer | undefined } | null {
    if (!this._buffer) {
      return null;
    }
    const index = this._buffer.indexOf("\n");
    if (index === -1) {
      return null;
    }
    const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
    const remaining = this._buffer.subarray(index + 1);
    this._buffer = remaining.length > 0 ? remaining : undefined;
    return { line, remaining };
  }

  clear(): void {
    this._buffer = undefined;
  }
}

function isValidJsonRpc(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && "jsonrpc" in (parsed as Record<string, unknown>);
  } catch {
    return false;
  }
}

/**
 * Client transport for stdio with JSON filtering.
 * Filters out non-JSON startup messages from MCP servers.
 */
export class FilteredStdioClientTransport implements Transport {
  private _process?: ReturnType<typeof spawn>;
  private _readBuffer: ReadBuffer;
  private _serverParams: StdioServerParameters;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(server: StdioServerParameters) {
    this._readBuffer = new ReadBuffer();
    this._serverParams = server;
  }

  async start(): Promise<void> {
    if (this._process) {
      throw new Error("StdioClientTransport already started!");
    }
    return new Promise((resolve, reject) => {
      // Always pipe stderr so we can capture and suppress startup messages
      // Only inherit stderr explicitly if user requests it
      const stderrMode: "pipe" | "inherit" | "ignore" = 
        this._serverParams.stderr === "inherit" ? "inherit" :
        this._serverParams.stderr === "ignore" ? "ignore" :
        "pipe";

      this._process = spawn(this._serverParams.command, this._serverParams.args ?? [], {
        env: {
          ...getDefaultEnvironment(),
          ...this._serverParams.env,
        },
        stdio: ["pipe", "pipe", stderrMode],
        shell: false,
        windowsHide: process.platform === "win32",
        cwd: this._serverParams.cwd,
      });

      this._process.on("error", (error: Error) => {
        reject(error);
        this.onerror?.(error);
      });

      this._process.on("spawn", () => {
        resolve();
      });

      this._process.on("close", (_code: number) => {
        this._process = undefined;
        this.onclose?.();
      });

      this._process.stdin?.on("error", (error: Error) => {
        this.onerror?.(error);
      });

      this._process.stdout?.on("data", (chunk: Buffer) => {
        this._readBuffer.append(chunk);
        this.processReadBuffer();
      });

      this._process.stdout?.on("error", (error: Error) => {
        this.onerror?.(error);
      });

      // Capture stderr but don't output it to console
      // This filters out server startup messages like "Server v2.2.4 running on stdio"
      if (this._process.stderr) {
        this._process.stderr.on("data", (_chunk: Buffer) => {
          // Silently consume stderr to prevent startup messages from appearing in TUI
          // Only emit actual errors if needed
        });
        this._process.stderr.on("error", () => {
          // Ignore stderr errors
        });
      }
    });
  }

  get pid(): number | null {
    return this._process?.pid ?? null;
  }

  private processReadBuffer(): void {
    // Filter out non-JSON lines
    while (true) {
      const result = this._readBuffer.readMessage();
      if (result === null) {
        break;
      }

      const { line } = result;

      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Skip non-JSON lines (like server startup messages)
      if (!isValidJsonRpc(line)) {
        continue;
      }

      try {
        const message = JSON.parse(line) as JSONRPCMessage;
        this.onmessage?.(message);
      } catch {
        // Skip invalid JSON-RPC messages
        continue;
      }
    }
  }

  async close(): Promise<void> {
    if (this._process) {
      const processToClose = this._process;
      this._process = undefined;
      const closePromise = new Promise<void>((resolve) => {
        processToClose.once("close", () => {
          resolve();
        });
      });

      try {
        processToClose.stdin?.end();
      } catch {
        // ignore
      }

      await Promise.race([
        closePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()),
      ]);

      if (processToClose.exitCode === null) {
        try {
          processToClose.kill("SIGTERM");
        } catch {
          // ignore
        }
        await Promise.race([
          closePromise,
          new Promise<void>((resolve) => setTimeout(resolve, 2000).unref()),
        ]);
      }

      if (processToClose.exitCode === null) {
        try {
          processToClose.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }
    this._readBuffer.clear();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._process?.stdin) {
        reject(new Error("Not connected"));
        return;
      }
      const json = serializeMessage(message);
      if (this._process.stdin.write(json)) {
        resolve();
      } else {
        this._process.stdin.once("drain", resolve);
      }
    });
  }
}
