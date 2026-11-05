import "server-only";
import { Pool, types, type CustomTypesConfig, type PoolClient } from "pg";

/**
 * ASSIST = this app's own PostgreSQL (ASSIST_* env): machines, modules, check logs, pending issues.
 * Pattern from bkh-insight's insight helpers. Placeholders are `$1, $2, …` (not `?`).
 * Schema changes go through db/migrations + `npm run db:migrate`, never from app code.
 */

// Cached on globalThis so dev HMR reuses the pool instead of opening a new one on every reload.
const cache = globalThis as typeof globalThis & { __assistPool?: Pool };

function config() {
  const keys = ["HOST", "PORT", "USER", "PASSWORD", "DATABASE"].map((k) => `ASSIST_${k}`);
  const missing = keys.filter((k) => !process.env[k]);
  // Names only, never values.
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
  const [host, port, user, password, database] = keys.map((k) => process.env[k]!);
  return { host, port: Number(port), user, password, database };
}

// DATE/TIMESTAMP/TIMESTAMPTZ come back as text in Thai time (session timezone below), matching HIS.
// Scoped to this pool, so pg's global type parsers stay untouched.
const DATE_TYPES = new Set<number>([types.builtins.DATE, types.builtins.TIMESTAMP, types.builtins.TIMESTAMPTZ]);
const assistTypes: CustomTypesConfig = {
  getTypeParser: ((id: number, format?: "text" | "binary") =>
    DATE_TYPES.has(id) ? (v: string) => v : types.getTypeParser(id, format)) as CustomTypesConfig["getTypeParser"],
};

function pool(): Pool {
  return (cache.__assistPool ??= new Pool({
    ...config(),
    options: "-c timezone=Asia/Bangkok",
    types: assistTypes,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  }));
}

/** Read from the assist DB. Use `RETURNING` here when a write must hand back generated values. */
export async function assistQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool().query(sql, params);
  return rows as T[];
}

/** INSERT/UPDATE/DELETE on the assist DB. */
export async function assistExecute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
  const { rowCount } = await pool().query(sql, params);
  return { rowCount: rowCount ?? 0 };
}

/** Run several statements atomically. */
export async function assistTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
