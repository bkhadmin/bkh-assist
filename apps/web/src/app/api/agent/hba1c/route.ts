import type { ApiError, HbA1cResponse } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { hisQuery } from "@/lib/his";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/**
 * HbA1c in HOSxP is lab_items_code 334 (unit %). Only reported results with a value count: 47 of 9,604
 * orders in 2026 had no result yet. Proven on bkhosxp 2026-11-06: ref on lab_head.hn (~75 rows per patient),
 * eq_ref on lab_order PRIMARY.
 */
const SQL = `SELECT DATE_FORMAT(h.order_date, '%Y-%m-%d') AS date, TRIM(lo.lab_order_result) AS value
  FROM lab_head h
  JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number AND lo.lab_items_code = 334
  WHERE h.hn = ? AND h.confirm_report = 'Y' AND TRIM(lo.lab_order_result) <> ''
  ORDER BY h.order_date DESC, h.order_time DESC
  LIMIT 3`;

/** GET /api/agent/hba1c?hn=<hn> — the last 3 HbA1c results of one patient, for the agent's top bar. */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const hn = new URL(req.url).searchParams.get("hn")?.trim() ?? "";
  if (!/^\d{1,9}$/.test(hn)) return error(400, { error: "invalid_hn" });
  try {
    const results = await hisQuery<HbA1cResponse["results"][number]>(SQL, [hn]);
    const body: HbA1cResponse = { hn, results: results.map((r) => ({ date: String(r.date), value: String(r.value) })) };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/hba1c] HIS error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
