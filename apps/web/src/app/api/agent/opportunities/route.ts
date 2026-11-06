import type { AgentOpportunitiesResponse, ApiError, Opportunity } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { machineConfig, moduleOpportunities, touchMachine } from "@/lib/check-store";
import { hisQuery } from "@/lib/his";
import { evaluateOpportunities, type OpportunityDef } from "@/lib/opportunities/engine";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/** The patient's latest visit. Proven on bkhosxp 2026-11-06: ref on ovst.ix_hn (~100 rows per patient). */
const LATEST_VISIT = "SELECT vn FROM ovst WHERE hn = ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1";

/** Item prices: nondrugitems.price / drugitems.unitprice, both keyed by icode (primary key). */
// shortcut: base price only, not the per-pttype price; switch to the pttype price table if finance needs the billed amount.
const PRICES = (n: number) => {
  const marks = Array(n).fill("?").join(",");
  return `SELECT icode, price FROM nondrugitems WHERE icode IN (${marks})
          UNION ALL SELECT icode, unitprice AS price FROM drugitems WHERE icode IN (${marks})`;
};

/** Price of each opportunity = sum of its icodes' prices; null when it has no icode or none is found in HOSxP. */
async function withPrices(items: Opportunity[], defs: Map<string, OpportunityDef>): Promise<Opportunity[]> {
  const icodes = [...new Set(items.flatMap((o) => defs.get(o.code)?.icodes ?? []))];
  if (!icodes.length) return items;
  const rows = await hisQuery<{ icode: string; price: number | string | null }>(PRICES(icodes.length), [...icodes, ...icodes]);
  const price = new Map(rows.map((r) => [String(r.icode), Number(r.price ?? 0)]));
  return items.map((o) => {
    const known = (defs.get(o.code)?.icodes ?? []).filter((c) => price.has(c));
    return { ...o, price: known.length ? known.reduce((sum, c) => sum + price.get(c)!, 0) : null };
  });
}

/**
 * GET /api/agent/opportunities?hn=<hn>&machine=<hostname> — for the agent's top bar badge "จัดเก็บ":
 * the opportunities (e.g. PP) the patient's latest visit matches, using every module of this machine
 * that has the add-on switched on. Same evaluation as a save check, without logging.
 */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const params = new URL(req.url).searchParams;
  const hn = params.get("hn")?.trim() ?? "";
  const machine = params.get("machine")?.trim() ?? "";
  if (!/^\d{1,9}$/.test(hn)) return error(400, { error: "invalid_hn" });
  if (!machine || machine.length > 100) return error(400, { error: "invalid_machine" });

  const machineId = await touchMachine(machine);
  if (machineId == null) return error(503, { error: "assist_unavailable" });
  try {
    const cfg = await machineConfig(machineId);
    const defs = new Map<string, OpportunityDef>();
    if (cfg.active) for (const m of cfg.modules) for (const d of await moduleOpportunities(m.code)) defs.set(d.code, d);

    const [visit] = defs.size ? await hisQuery<{ vn: string }>(LATEST_VISIT, [hn]) : [];
    const items = visit ? await withPrices(await evaluateOpportunities([...defs.values()], String(visit.vn)), defs) : [];
    const body: AgentOpportunitiesResponse = { hn, vn: visit ? String(visit.vn) : null, items };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/opportunities] error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
