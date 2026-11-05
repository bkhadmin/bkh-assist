import { connection } from "next/server";
import { assistQuery } from "@/lib/assist";
import { hisQuery } from "@/lib/his";

async function probe(fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    await fn();
    return { ok: true as const, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false as const, code: (err as { code?: string } | null)?.code ?? "error" };
  }
}

/**
 * 200 while HIS is reachable (checks can run); assist being down only degrades logging.
 * Agents use this for their tray status.
 */
export async function GET() {
  // Never prerender: this must hit the DBs on every request.
  await connection();

  const [his, assist] = await Promise.all([
    probe(() => hisQuery<{ ok: number }>("SELECT 1 AS ok", [])),
    probe(() => assistQuery("SELECT 1 AS ok")),
  ]);
  if (!his.ok) console.error("[health] HIS check failed:", his.code);
  if (!assist.ok) console.error("[health] assist check failed:", assist.code);

  const body = {
    status: his.ok ? (assist.ok ? "ok" : "degraded") : "error",
    his: his.ok ? "ok" : "error",
    assist: assist.ok ? "ok" : "error",
    latencyMs: { his: his.ok ? his.latencyMs : null, assist: assist.ok ? assist.latencyMs : null },
  };
  return Response.json(body, { status: his.ok ? 200 : 503 });
}
