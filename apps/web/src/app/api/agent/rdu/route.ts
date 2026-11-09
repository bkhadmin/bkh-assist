import type { AgentRduResponse, ApiError, RduHit } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { assistQuery } from "@/lib/assist";
import { touchMachine } from "@/lib/check-store";
import { hisQuery } from "@/lib/his";
import { PENDING_DRUG, RDU_RULES, bind, normalizeDrugText } from "@/lib/rdu/rules";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/** The patient's latest visit. Proven on bkhosxp 2026-11-06: ref on ovst.ix_hn (~100 rows per patient). */
const LATEST_VISIT = "SELECT vn FROM ovst WHERE hn = ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1";

type DrugRow = { name: string; strength: string | null; qty: number | string | null; units: string | null; howto: string | null; pending: number | string };
type Row = DrugRow & { dx?: string };

/**
 * GET /api/agent/rdu?hn=<hn>&machine=<hostname>[&drug=<text in HOSxP's drug box>] — RDU rules hit by the patient's
 * latest visit, with the not-yet-saved `drug` (resolved to a drugitems icode) taking part in every rule.
 * Rules switched off on /admin/rdu are skipped. Proven 2026-11-09 on bkhosxp: each rule 1–3 ms avg (index lookups
 * on opitemrece.ix_vn, ovstdiag.vn/hn, clinicmember, lab_head.ix_hn_order_date), all 12 under ~20 ms per visit.
 */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const params = new URL(req.url).searchParams;
  const hn = params.get("hn")?.trim() ?? "";
  const machine = params.get("machine")?.trim() ?? "";
  const drugText = normalizeDrugText(params.get("drug") ?? "");
  if (!/^\d{1,9}$/.test(hn)) return error(400, { error: "invalid_hn" });
  if (!machine || machine.length > 100) return error(400, { error: "invalid_machine" });

  const machineId = await touchMachine(machine);
  if (machineId == null) return error(503, { error: "assist_unavailable" });
  let off: Set<string>;
  try {
    off = new Set((await assistQuery<{ rule_code: string }>("SELECT rule_code FROM rdu_settings WHERE NOT is_active")).map((r) => r.rule_code));
  } catch {
    return error(503, { error: "assist_unavailable" });
  }

  try {
    const [[visit], [drug]] = await Promise.all([
      hisQuery<{ vn: string }>(LATEST_VISIT, [hn]),
      drugText ? hisQuery<{ icode: string; name: string }>(PENDING_DRUG, [drugText]) : [],
    ]);
    const pendingDrug = drug ? { icode: String(drug.icode), name: drug.name } : null;
    const hits: RduHit[] = [];
    if (visit) {
      const p = { hn, vn: String(visit.vn), icode: pendingDrug?.icode ?? "" };
      for (const rule of RDU_RULES) {
        if (off.has(rule.code)) continue;
        const q = bind(rule.sql, p);
        const rows = await hisQuery<Row>(q.sql, q.params).catch((err: unknown) => {
          // one failing rule must not hide the others; privacy: rule code and error code only
          const cause = err instanceof Error ? (err.cause ?? err) : err;
          console.error("[agent/rdu] rule failed", rule.code, (cause as { code?: string } | null)?.code ?? "unknown");
          return [];
        });
        if (!rows.length) continue;
        const drugRows = rows.filter((r) => r.dx === undefined);
        hits.push({
          code: rule.code,
          label: rule.label,
          criteria: rule.criteria,
          // pending/qty may come back as strings (bigNumberStrings)
          drugs: drugRows.map((r) => ({
            name: r.name,
            strength: r.strength,
            qty: r.qty == null ? null : Number(r.qty),
            units: r.units,
            howto: r.howto || null,
            pending: Number(r.pending) === 1,
          })),
          dx: rows.flatMap((r) => (r.dx ? [r.dx] : [])),
        });
      }
    }
    const body: AgentRduResponse = { hn, vn: visit ? String(visit.vn) : null, pendingDrug, hits };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/rdu] error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
