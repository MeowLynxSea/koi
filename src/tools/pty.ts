/**
 * PTY Utilities — Bun.spawn terminal 封装
 *
 * 提供跨平台 PTY (Pseudo-Terminal) 功能，用于:
 * - 完全隔离输入输出流
 * - 支持交互式命令（如 sudo、vim）
 * - 支持 monitor 内的进程输入
 */

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

export interface PtyData {
  type: "data" | "exit" | "error";
  data?: string;
  exitCode?: number;
  error?: string;
}

export type PtyDataCallback = (data: PtyData) => void;

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

/**
 * IPty 兼容接口 — 与 node-pty 的 IPty 保持一致
 */
export interface IPty {
  pid: number;
  onData(handler: (data: string) => void): void;
  onExit(handler: (exit: { exitCode: number; signal: string }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

/**
 * Windows PowerShell subprocess with stdin/stdout pipe support
 * Uses PowerShell to execute commands with proper I/O handling
 */
class WindowsPowerShellSubprocess extends EventEmitter implements IPty {
  readonly pid: number;
  private proc: ReturnType<typeof Bun.spawn>;
  private textDecoder = new TextDecoder();
  private _isRunning = true;
  private stdoutPipe: WritableStream<Uint8Array> | null = null;

  constructor(options: PtyOptions) {
    super();

    // Use PowerShell with encoded command for proper escaping
    // -NoProfile: skip profile scripts for faster startup
    // -NoLogo: no banner
    // -Command: execute command
    // Using -Command with proper encoding handles complex commands better
    const psCommand = options.command ?? "";
    const psArgs = ["-NoProfile", "-NoLogo", "-Command", psCommand];

    this.proc = Bun.spawn(["powershell.exe", ...psArgs], {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        CLAUDECODE: "1",
        TERM: "xterm-256color",
      } as Record<string, string>,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      onExit: (_subprocess: unknown, exitCode: number | null, signalCode: number | null) => {
        this._isRunning = false;
        this.emit("exit", { exitCode: exitCode ?? 0, signal: signalCode !== null ? String(signalCode) : "" });
      },
    });

    this.pid = this.proc.pid;
    this.stdoutPipe = this.proc.stdout as WritableStream<Uint8Array> | null;

    // Handle stdout
    if (this.proc.stdout) {
      this.readStream(this.proc.stdout);
    }

    // Handle stderr
    if (this.proc.stderr) {
      this.readStream(this.proc.stderr);
    }
  }

  private async readStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    try {
      const reader = stream.getReader();
      while (this._isRunning) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          this.emit("data", this.textDecoder.decode(value));
        }
      }
    } catch {
      // Stream closed or error
    }
  }

  onData(handler: (data: string) => void): void {
    this.on("data", handler);
  }

  onExit(handler: (exit: { exitCode: number; signal: string }) => void): void {
    this.on("exit", handler);
  }

  write(data: string): void {
    if (this._isRunning && this.proc.stdin) {
      try {
        const writer = (this.proc.stdin as WritableStream<Uint8Array>).getWriter();
        writer.write(new TextEncoder().encode(data));
        writer.releaseLock();
      } catch {
        // stdin may be closed
      }
    }
  }

  resize(_cols: number, _rows: number): void {
    // PowerShell doesn't support resize in the same way, but we could
    // send mode con cols=... rows=... if needed
  }

  kill(signal?: string): void {
    if (this._isRunning) {
      try {
        this.proc.kill(signal as number | NodeJS.Signals);
      } catch {
        // ignore
      }
      this._isRunning = false;
    }
  }
}

/**
 * Bun PTY 适配器 — 使用 Bun.spawn 的 terminal 选项
 */
class BunPty extends EventEmitter implements IPty {
  readonly pid: number;
  private proc: ReturnType<typeof Bun.spawn>;
  private textDecoder = new TextDecoder();

  constructor(options: PtyOptions) {
    super();
    const shell = process.platform === "win32" ? "powershell.exe" : "bash";
    const args = process.platform === "win32" ? [] : ["--login"];

    const command = options.command ?? shell;
    const commandArgs = options.args ?? args;

    this.proc = Bun.spawn([command, ...commandArgs], {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        CLAUDECODE: "1",
        TERM: "xterm-256color",
      } as Record<string, string>,
      terminal: {
        name: options.name ?? "xterm-256color",
        cols: options.cols ?? DEFAULT_COLS,
        rows: options.rows ?? DEFAULT_ROWS,
        data: (_terminal: unknown, data: Uint8Array) => {
          this.emit("data", this.textDecoder.decode(data));
        },
      },
      onExit: (_subprocess: unknown, exitCode: number | null, signalCode: number | null) => {
        this.emit("exit", { exitCode: exitCode ?? 0, signal: signalCode !== null ? String(signalCode) : "" });
      },
    });

    this.pid = this.proc.pid;
  }

  onData(handler: (data: string) => void): void {
    this.on("data", handler);
  }

  onExit(handler: (exit: { exitCode: number; signal: string }) => void): void {
    this.on("exit", handler);
  }

  write(data: string): void {
    this.proc.terminal?.write(data);
  }

  resize(cols: number, rows: number): void {
    try {
      this.proc.terminal?.resize(cols, rows);
    } catch {
      // 忽略调整大小失败
    }
  }

  kill(signal?: string): void {
    try {
      this.proc.kill(signal as number | NodeJS.Signals);
    } catch {
      // ignore
    }
  }
}

/**
 * 创建并启动一个 PTY 进程
 * 注意：这个函数不设置任何监听器。调用者应该：
 * 1. 直接使用 pty.onData/pty.onExit 设置监听器
 * 2. 或者用 PtySession 包装（它会自动设置监听器）
 * 
 * Windows 平台使用 PowerShell subprocess，支持 stdin/stdout pipe。
 */
export function spawnPty(options: PtyOptions): IPty {
  // Windows 不支持 Bun.spawn 的 terminal 选项，使用 PowerShell subprocess
  if (process.platform === "win32") {
    return new WindowsPowerShellSubprocess(options);
  }
  return new BunPty(options);
}

/**
 * PtySession 类 — 封装一个 PTY 会话
 * 支持发送输入、调整大小、获取输出等
 */
export class PtySession extends EventEmitter {
  readonly id: string;
  readonly command: string;
  readonly startTime: number;

  /** 暴露底层 PTY 对象，用于清理监听器 */
  readonly pty: IPty;

  private outputBuffer: string[] = [];
  private lastOutput: string = "";
  private _exitCode?: number;
  private _isRunning: boolean = true;
  private _dataHandler: (data: string) => void;
  private _exitHandler: (exit: { exitCode: number; signal: string }) => void;

  constructor(id: string, pty: IPty, command: string) {
    super();
    this.id = id;
    this.pty = pty;
    this.command = command;
    this.startTime = Date.now();

    this._dataHandler = (data: string) => {
      this.lastOutput = data;
      this.outputBuffer.push(data);
      this.emit("data", data);
    };

    this._exitHandler = ({ exitCode, signal }) => {
      this._isRunning = false;
      this._exitCode = exitCode;
      this.emit("exit", { exitCode, signal });
    };

    pty.onData(this._dataHandler);
    pty.onExit(this._exitHandler);
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
    } catch {
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
   * 清理 PTY 监听器（用于 adopt 场景）
   * 调用后此 PtySession 将不再接收 PTY 事件
   */
  cleanup(): void {
    // BunPty extends EventEmitter, so removeListener works
    try {
      const ptyAsEmitter = this.pty as unknown as EventEmitter;
      if (typeof ptyAsEmitter.removeListener === "function") {
        ptyAsEmitter.removeListener("data", this._dataHandler);
        ptyAsEmitter.removeListener("exit", this._exitHandler);
      }
    } catch {
      // ignore if removeListener fails
    }
    // 清理 PtySession 自身的事件监听器
    this.removeAllListeners();
    this._isRunning = false;
  }

  /**
   * 关闭 PTY（不杀进程）- 已废弃，请使用 cleanup()
   * @deprecated 使用 cleanup() 代替
   */
  detach(): void {
    this.cleanup();
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
