import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

/**
 * Read-only access to the HOSxP database (HIS_* env, MariaDB/MySQL).
 *
 * Defense in depth: the DB user must have SELECT grants only; on top of that every
 * session is set READ ONLY and every statement passes `assertSafeSelect` below.
 */

export type HisParam = string | number | bigint | boolean | Date | null;

const QUERY_TIMEOUT_MS = 10_000;

let pool: Pool | undefined;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (see root .env.example)`);
  return v;
}

function getPool(): Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: requireEnv("HIS_HOST"),
    port: Number(process.env.HIS_PORT || 3306),
    user: requireEnv("HIS_USER"),
    password: process.env.HIS_PASSWORD ?? "",
    database: requireEnv("HIS_DATABASE"),
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    queueLimit: 50,
    connectTimeout: 5_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Return DATE/DATETIME as "YYYY-MM-DD HH:mm:ss" strings in HIS local time; no TZ conversion.
    dateStrings: true,
    multipleStatements: false,
    namedPlaceholders: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  // `pool.on("connection")` hands out the callback-style core connection.
  pool.pool.on("connection", (conn) => {
    // HOSxP's init_connect forces SET NAMES tis620, so UTF-8 params (Thai text) would be misread.
    // Learned in bkh-insight; HN/VN are digits today, but text rules/searches will need this.
    conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci", (err) => {
      if (err) console.error("[his] could not set utf8mb4:", err.code ?? err.message);
    });
    conn.query("SET SESSION TRANSACTION READ ONLY", (err) => {
      if (err) console.error("[his] could not set session read-only:", err.code ?? err.message);
    });
  });
  return pool;
}

/** Blank out string literals, quoted identifiers and comments so checks below only see SQL structure. */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.|"")*"/g, '""')
    .replace(/`(?:[^`]|``)*`/g, "``")
    .replace(/--[ \t][^\n]*|#[^\n]*/g, " ");
}

const FORBIDDEN =
  /\b(?:insert\s+into|delete\s+from|update\s+\S+\s+set|replace\s+into|drop|alter|create|truncate|grant|revoke|rename\s+table|lock\s+tables?|for\s+update|lock\s+in\s+share\s+mode|into\s+(?:outfile|dumpfile))\b|\binto\s+@/i;

/** Throws unless `sql` is a single SELECT/WITH statement using exactly `paramCount` `?` placeholders. */
export function assertSafeSelect(sql: string, paramCount: number): void {
  const s = stripLiteralsAndComments(sql).trim().replace(/;\s*$/, "");
  if (!/^(?:select|with)\b/i.test(s)) throw new Error("hisQuery: only SELECT/WITH statements are allowed");
  if (s.includes(";")) throw new Error("hisQuery: multiple statements are not allowed");
  if (s.includes("/*")) throw new Error("hisQuery: block comments are not allowed");
  if (FORBIDDEN.test(s)) throw new Error("hisQuery: statement contains a forbidden clause");
  if (s.includes("??")) throw new Error("hisQuery: identifier placeholders (??) are not allowed");
  if (/(^|[^:\w]):[a-zA-Z_]\w*/.test(s)) throw new Error("hisQuery: named placeholders are not allowed; use ?");
  const placeholders = (s.match(/\?/g) ?? []).length;
  if (placeholders !== paramCount) {
    throw new Error(`hisQuery: expected ${placeholders} params for ${placeholders} placeholders, got ${paramCount}`);
  }
}

function assertParams(params: unknown[]): asserts params is HisParam[] {
  for (const p of params) {
    const ok =
      p === null ||
      typeof p === "string" ||
      typeof p === "number" ||
      typeof p === "bigint" ||
      typeof p === "boolean" ||
      p instanceof Date;
    if (!ok) throw new Error(`hisQuery: unsupported param type ${typeof p}`);
  }
}

/**
 * Run a parameterized read-only query against HOSxP.
 * Values are always sent as bound parameters of a server-side prepared statement, never concatenated.
 */
export async function hisQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  assertSafeSelect(sql, params.length);
  assertParams(params);
  const [rows] = await getPool().execute<RowDataPacket[]>({ sql, timeout: QUERY_TIMEOUT_MS }, params);
  return rows as T[];
}
