// Run: npm run db:migrate   (= node --env-file=.env scripts/migrate.mjs)
// Applies db/migrations/*.sql to the assist PostgreSQL DB (never HIS), in name order, one transaction each.
// Adapted from bkh-insight. Name new files <yyyymmddHHMM>_<what>.sql; never edit a file once applied.
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const keys = ["HOST", "PORT", "USER", "PASSWORD", "DATABASE"].map((k) => `ASSIST_${k}`);
const missing = keys.filter((k) => !process.env[k]);
if (missing.length) {
  // Names only, never values.
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}
const [host, port, user, password, database] = keys.map((k) => process.env[k]);

const dir = new URL("../db/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ host, port: Number(port), user, password, database });
try {
  await client.connect();
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const applied = [];
  for (const name of files.filter((f) => !done.has(f))) {
    const sql = await readFile(new URL(name, dir), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`${name}: ${e.message}`);
    }
    applied.push(name);
  }
  console.log(applied.length ? `Applied:\n${applied.join("\n")}` : "Nothing to apply");
} catch (e) {
  console.error(`Migration failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
