/**
 * Tool Orchestration — 工具调度器
 *
 * Manages execution ordering: read-only tools run concurrently,
 * write tools are serialized via an internal mutex.
 *
 * All Koi custom tools register with executionMode: "parallel" to avoid
 * Pi's all-sequential fallback, then write tools self-coordinate here.
 */

import { isReadOnlyTool } from "../tools/types.js";

/** 写入工具互斥锁 — Promise 链实现串行队列 */
export class WriteToolMutex {
  private queue: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.queue;
    this.queue = this.queue.then(() => promise);
    await previous;
    return release!;
  }
}

export const globalWriteMutex = new WriteToolMutex();

/** 分类工具调用为只读 / 写入两组 */
export function classifyToolCalls<T extends { name: string }>(
  calls: T[]
): { readonly: T[]; write: T[] } {
  const readonly: T[] = [];
  const write: T[] = [];
  for (const call of calls) {
    if (isReadOnlyTool(call.name)) {
      readonly.push(call);
    } else {
      write.push(call);
    }
  }
  return { readonly, write };
}

/** 在 execute() 内部包装写入工具，确保串行 */
export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = await globalWriteMutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
