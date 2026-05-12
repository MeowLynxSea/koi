/**
 * Schema initialization and migration runner.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { DatabaseManager } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, "schema.sql");
const TARGET_VERSION = 1;

export async function initDb(db: DatabaseManager): Promise<void> {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf-8");

  // Apply base schema
  await db.executescript(schemaSql);

  // Version check & migrations
  const row = await db.fetchone<{ version: number }>(
    "SELECT MAX(version) as version FROM _schema_version"
  );
  const currentVersion = row?.version ?? 0;

  if (currentVersion < TARGET_VERSION) {
    // Future migrations go here
    await db.execute(
      "INSERT OR REPLACE INTO _schema_version (version) VALUES (?)",
      [TARGET_VERSION]
    );
  }
}

export async function checkFts5Support(db: DatabaseManager): Promise<boolean> {
  try {
    const row = await db.fetchone<{ n: number }>(
      "SELECT 1 as n FROM sqlite_master WHERE type='table' AND name='context_vectors_fts'"
    );
    return row?.n === 1;
  } catch {
    return false;
  }
}
