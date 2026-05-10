/**
 * PTY Utilities — NodePTY 封装
 *
 * 提供跨平台 PTY (Pseudo-Terminal) 功能，用于:
 * - 完全隔离输入输出流
 * - 支持交互式命令（如 sudo、vim）
 * - 支持 monitor 内的进程输入
 */

import * as pty from "node-pty";
import { EventEmitter } from "events";

export interface PtyOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
}

interface PtyData {
  type: "data" | "exit" | "error";
  data?: string;
  exitCode?: number;
  error?: string;
}

export type PtyDataCallback = (data: PtyData) => void;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

/**
 * 创建并启动一个 PTY 进程
 */
export function spawnPty(
  options: PtyOptions,
  onData?: PtyDataCallback
): pty.IPty {
  const shell = process.platform === "win32" ? "powershell.exe" : "bash";
  const args = process.platform === "win32" ? [] : ["--login"];

  const ptyProcess = pty.spawn(options.command ?? shell, options.args ?? args, {
    name: options.name ?? "xterm-color",
    cols: options.cols ?? DEFAULT_COLS,
    rows: options.rows ?? DEFAULT_ROWS,
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...options.env,
      CLAUDECODE: "1",
      TERM: "xterm-256color",
    } as { [key: string]: string },
  });

  if (onData) {
    ptyProcess.onData((data: string) => {
      onData({ type: "data", data });
    });
  }

  return ptyProcess;
}

/**
 * PtySession 类 — 封装一个 PTY 会话
 * 支持发送输入、调整大小、获取输出等
 */
export class PtySession extends EventEmitter {
  readonly id: string;
  readonly command: string;
  readonly startTime: number;

  private pty: pty.IPty;
  private outputBuffer: string[] = [];
  private lastOutput: string = "";
  private _exitCode?: number;
  private _isRunning: boolean = true;

  constructor(id: string, pty: pty.IPty, command: string) {
    super();
    this.id = id;
    this.pty = pty;
    this.command = command;
    this.startTime = Date.now();

    pty.onData((data: string) => {
      this.lastOutput = data;
      // 不在这里 split lines，由调用者决定如何处理
      this.outputBuffer.push(data);
      this.emit("data", data);
    });

    pty.onExit(({ exitCode, signal }) => {
      this._isRunning = false;
      this._exitCode = exitCode;
      this.emit("exit", { exitCode, signal });
    });
  }

  /**
   * 向 PTY 进程发送输入
   */
  write(data: string): void {
    if (this._isRunning) {
      this.pty.write(data);
    }
  }

  /**
   * 发送带换行的输入
   */
  sendLine(line: string): void {
    this.write(line + "\n");
  }

  /**
   * 发送 Ctrl+C
   */
  sendInterrupt(): void {
    this.write("\x03"); // Ctrl+C
  }

  /**
   * 调整 PTY 大小
   */
  resize(cols: number, rows: number): void {
    try {
      this.pty.resize(cols, rows);
    } catch (e) {
      // 忽略调整大小失败
    }
  }

  /**
   * 获取当前是否在运行
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * 获取退出码
   */
  get exitCode(): number | undefined {
    return this._exitCode;
  }

  /**
   * 获取最后输出
   */
  get currentOutput(): string {
    return this.lastOutput;
  }

  /**
   * 获取所有输出（合并后的字符串）
   */
  getAllOutput(): string {
    return this.outputBuffer.join("");
  }

  /**
   * 获取所有输出（按行分割）
   */
  getOutputLines(): string[] {
    const all = this.getAllOutput();
    return all.split("\n").filter((line) => line.length > 0);
  }

  /**
   * 关闭 PTY（不杀进程）
   */
  detach(): void {
    try {
      this.pty.removeAllListeners();
      // 不调用 kill，让进程继续运行
    } catch {
      // ignore
    }
    this._isRunning = false;
  }

  /**
   * 终止 PTY 进程
   */
  kill(signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
    try {
      this.pty.kill(signal);
    } catch {
      // ignore
    }
    this._isRunning = false;
  }
}

/**
 * 生成唯一的 PtySession ID
 */
export function generatePtyId(): string {
  return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
