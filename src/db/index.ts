import { DatabaseSync } from "node:sqlite";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? "./helm.db";

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) throw new Error("DB not initialized — call initDb() first");
  return db;
}

export async function initDb(): Promise<void> {
  db = new DatabaseSync(path.resolve(DB_PATH));

  db.exec(`
    CREATE TABLE IF NOT EXISTS synthesis_cache (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      tool TEXT NOT NULL,
      params_hash TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_lookup
      ON synthesis_cache (owner, repo, tool, params_hash);

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      params TEXT NOT NULL,
      duration_ms INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  console.log("Database initialized at", DB_PATH);
}

const CACHE_TTL = parseInt(process.env.CACHE_TTL ?? "3600", 10) * 1000;

function cacheKey(params: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
    )
  );
}

export function getCached(
  owner: string,
  repo: string,
  tool: string,
  params: Record<string, string>
): string | null {
  const db = getDb();
  const paramsHash = cacheKey(params);
  const now = Date.now();

  const stmt = db.prepare(
    `SELECT result FROM synthesis_cache
     WHERE owner = ? AND repo = ? AND tool = ? AND params_hash = ?
       AND expires_at > ?`
  );
  const row = stmt.get(owner, repo, tool, paramsHash, now) as
    | { result: string }
    | undefined;

  return row?.result ?? null;
}

export function setCached(
  owner: string,
  repo: string,
  tool: string,
  params: Record<string, string>,
  result: string
): void {
  const db = getDb();
  const paramsHash = cacheKey(params);
  const now = Date.now();
  const id = `${owner}/${repo}/${tool}/${paramsHash}`;

  db.prepare(
    `INSERT OR REPLACE INTO synthesis_cache
       (id, owner, repo, tool, params_hash, result, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, owner, repo, tool, paramsHash, result, now, now + CACHE_TTL);
}

export function logAction(
  tool: string,
  owner: string,
  repo: string,
  params: Record<string, string>,
  durationMs?: number,
  error?: string
): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO action_log (tool, owner, repo, params, duration_ms, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      tool,
      owner,
      repo,
      JSON.stringify(params),
      durationMs ?? null,
      error ?? null,
      Date.now()
    );
  } catch {
    // Non-critical — don't let logging failures break tool calls
  }
}
