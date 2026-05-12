/**
 * Database connection and session management for Cat's Context Engine.
 *
 * Wraps bun:sqlite with an async-style API so graph operations can be
 * awaited without blocking the TUI event loop for long transactions.
 */

import { Database } from "bun:sqlite";
import path from "path";
import os from "os";
import fs from "fs";

const CCE_DIR = path.join(os.homedir(), ".config", "koi", "cce");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export interface DbRow {
  [key: string]: unknown;
}

export class DatabaseManager {
  private db: Database;
  private _closed = false;

  constructor(namespace: string) {
    ensureDir(CCE_DIR);
    const dbPath = path.join(CCE_DIR, `${namespace}.db`);
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");
    this.db.exec("PRAGMA foreign_keys=ON");
  }

  get isClosed(): boolean {
    return this._closed;
  }

  // ------------------------------------------------------------------
  // Async wrappers that yield to event loop between calls
  // ------------------------------------------------------------------

  async execute(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    if (this._closed) throw new Error("Database is closed");
    await Promise.resolve(); // yield
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params as any[]));
    stmt.finalize();
    return { lastInsertRowid: Number(result.lastInsertRowid), changes: result.changes };
  }

  async fetchone<T = DbRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (this._closed) throw new Error("Database is closed");
    await Promise.resolve();
    const stmt = this.db.prepare(sql);
    const rows = stmt.values(...(params as any[])) as T[];
    stmt.finalize();
    return rows[0] ?? null;
  }

  async fetchall<T = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this._closed) throw new Error("Database is closed");
    await Promise.resolve();
    const stmt = this.db.prepare(sql);
    const rows = stmt.values(...(params as any[])) as T[];
    stmt.finalize();
    return rows;
  }

  async executescript(sql: string): Promise<void> {
    if (this._closed) throw new Error("Database is closed");
    await Promise.resolve();
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this._closed) throw new Error("Database is closed");
    await Promise.resolve();
    const tx = new Transaction(this.db);
    try {
      await tx.begin();
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  close(): void {
    if (!this._closed) {
      this.db.close();
      this._closed = true;
    }
  }
}

export class Transaction {
  private db: Database;
  private _active = false;

  constructor(db: Database) {
    this.db = db;
  }

  async begin(): Promise<void> {
    await Promise.resolve();
    this.db.exec("BEGIN");
    this._active = true;
  }

  async commit(): Promise<void> {
    await Promise.resolve();
    this.db.exec("COMMIT");
    this._active = false;
  }

  async rollback(): Promise<void> {
    await Promise.resolve();
    if (this._active) {
      this.db.exec("ROLLBACK");
      this._active = false;
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    await Promise.resolve();
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params as any[]));
    stmt.finalize();
    return { lastInsertRowid: Number(result.lastInsertRowid), changes: result.changes };
  }

  async fetchone<T = DbRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    await Promise.resolve();
    const stmt = this.db.prepare(sql);
    const rows = stmt.values(...(params as any[])) as T[];
    stmt.finalize();
    return rows[0] ?? null;
  }

  async fetchall<T = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    await Promise.resolve();
    const stmt = this.db.prepare(sql);
    const rows = stmt.values(...(params as any[])) as T[];
    stmt.finalize();
    return rows;
  }
}

// Singleton map per namespace
const dbInstances = new Map<string, DatabaseManager>();

export function getDbManager(namespace: string): DatabaseManager {
  if (!dbInstances.has(namespace)) {
    dbInstances.set(namespace, new DatabaseManager(namespace));
  }
  return dbInstances.get(namespace)!;
}

export function closeDbManager(namespace?: string): void {
  if (namespace) {
    const db = dbInstances.get(namespace);
    if (db) {
      db.close();
      dbInstances.delete(namespace);
    }
  } else {
    for (const [ns, db] of dbInstances) {
      db.close();
      dbInstances.delete(ns);
    }
  }
}
