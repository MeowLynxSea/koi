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
import * as fs from "fs";
import { dirname, join } from "path";

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
 * Fix node-pty spawn-helper executable permissions.
 * Bun/npm installs may strip +x from prebuilt binaries, causing
 * "posix_spawnp failed" on macOS/Linux.
 */
function fixNodePtyPermissions(): void {
  try {
    const nodePtyUrl = import.meta.resolve("node-pty");
    const nodePtyPath = nodePtyUrl.replace("file://", "");
    const prebuildsDir = join(dirname(nodePtyPath), "..", "prebuilds");
    const platformArch = `${process.platform}-${process.arch}`;
    const helperPath = join(prebuildsDir, platformArch, "spawn-helper");

    if (fs.existsSync(helperPath)) {
      const stat = fs.statSync(helperPath);
      const isExecutable = (stat.mode & 0o111) !== 0;
      if (!isExecutable) {
        fs.chmodSync(helperPath, stat.mode | 0o755);
      }
    }
  } catch {
    // ignore resolution/permission errors
  }
}

/**
 * 创建并启动一个 PTY 进程
 * 注意：这个函数不设置任何监听器。调用者应该：
 * 1. 直接使用 pty.onData/pty.onExit 设置监听器
 * 2. 或者用 PtySession 包装（它会自动设置监听器）
 */
export function spawnPty(options: PtyOptions): pty.IPty {
  const shell = process.platform === "win32" ? "powershell.exe" : "bash";
  const args = process.platform === "win32" ? [] : ["--login"];

  const spawnOpts = {
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
  };

  try {
    return pty.spawn(options.command ?? shell, options.args ?? args, spawnOpts);
  } catch (err: any) {
    if (err?.message?.includes("posix_spawnp failed")) {
      fixNodePtyPermissions();
      return pty.spawn(options.command ?? shell, options.args ?? args, spawnOpts);
    }
    throw err;
  }
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
  readonly pty: pty.IPty;
  
  private outputBuffer: string[] = [];
  private lastOutput: string = "";
  private _exitCode?: number;
  private _isRunning: boolean = true;
  private _dataHandler: (data: string) => void;
  private _exitHandler: (exit: { exitCode: number; signal: string }) => void;

  constructor(id: string, pty: pty.IPty, command: string) {
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
   * 清理 PTY 监听器（用于 adopt 场景）
   * 调用后此 PtySession 将不再接收 PTY 事件
   */
  cleanup(): void {
    // node-pty's IPty interface doesn't expose removeListener,
    // but the underlying EventEmitter supports it
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
