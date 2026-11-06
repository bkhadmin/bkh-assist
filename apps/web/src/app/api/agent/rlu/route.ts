import type { AgentRluResponse, ApiError, RluItem } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { assistQuery } from "@/lib/assist";
import { touchMachine } from "@/lib/check-store";
import { hisQuery } from "@/lib/his";
import type { Condition } from "@/lib/opportunities/conditions";
import { evaluateOpportunities } from "@/lib/opportunities/engine";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/** The patient's latest visit. Proven on bkhosxp 2026-11-06: ref on ovst.ix_hn (~100 rows per patient). */
const LATEST_VISIT = "SELECT vn FROM ovst WHERE hn = ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1";

/**
 * Last 3 reported results per lab code of one patient, all items' codes in one query; the route keeps the newest 3
 * per item (an item spanning several codes takes them from the union). Reported = confirm_report 'Y' and a value,
 * same as /api/agent/hba1c. Proven on bkhosxp 2026-11-06 (2 codes): 28 ms, ref on lab_head.hn (~140 rows per
 * patient), ref on lab_order PRIMARY, eq_ref on lab_items PRIMARY, then ROW_NUMBER over a few hundred rows.
 */
const RESULTS = (n: number) => `SELECT code, date, value, name FROM (
    SELECT lo.lab_items_code AS code, DATE_FORMAT(h.order_date, '%Y-%m-%d') AS date, TRIM(lo.lab_order_result) AS value,
           i.lab_items_name AS name, h.order_date, h.order_time,
           ROW_NUMBER() OVER (PARTITION BY lo.lab_items_code ORDER BY h.order_date DESC, h.order_time DESC) AS rn
    FROM lab_head h
    JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number AND lo.lab_items_code IN (${Array(n).fill("?").join(", ")})
    LEFT JOIN lab_items i ON i.lab_items_code = lo.lab_items_code
    WHERE h.hn = ? AND h.confirm_report = 'Y' AND TRIM(lo.lab_order_result) <> ''
  ) t WHERE rn <= 3 ORDER BY order_date DESC, order_time DESC`;

type ItemRow = { code: string; label: string; lab_codes: string[]; conditions: Condition[]; message: string | null };
type ResultRow = { code: string | number; date: string; value: string; name: string | null };

/**
 * GET /api/agent/rlu?hn=<hn>&machine=<hostname> — for the agent's top bar badge "RLU": every active RLU item with
 * its last 3 results, and whether its conditions match the patient's latest visit (same engine as opportunities).
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
  let defs: ItemRow[];
  try {
    defs = await assistQuery<ItemRow>(
      "SELECT code, label, lab_codes, conditions, message FROM rlu_items WHERE is_active ORDER BY sort_order, code",
    );
  } catch {
    return error(503, { error: "assist_unavailable" });
  }
  if (!defs.length) return Response.json({ hn, vn: null, items: [] } satisfies AgentRluResponse);

  try {
    const codes = [...new Set(defs.flatMap((d) => d.lab_codes))];
    const [results, [visit]] = await Promise.all([
      hisQuery<ResultRow>(RESULTS(codes.length), [...codes, hn]),
      hisQuery<{ vn: string }>(LATEST_VISIT, [hn]),
    ]);
    const vn = visit ? String(visit.vn) : null;
    // category is unused here; evaluateOpportunities skips items without conditions (never warn)
    const hits = vn ? await evaluateOpportunities(defs.map((d) => ({ code: d.code, category: "RLU", label: d.label, conditions: d.conditions })), vn) : [];
    const warned = new Set(hits.map((h) => h.code));

    const items: RluItem[] = defs.map((d) => ({
      code: d.code,
      label: d.label,
      warn: warned.has(d.code),
      message: d.message,
      // rows are newest first, so the first 3 of this item's codes are its last 3
      results: results
        .filter((r) => d.lab_codes.includes(String(r.code)))
        .slice(0, 3)
        .map((r) => ({ date: String(r.date), value: String(r.value), name: r.name ?? d.label })),
    }));
    const body: AgentRluResponse = { hn, vn, items };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/rlu] error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
