import type { AgentAuthenResponse, ApiError } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { hisQuery } from "@/lib/his";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/**
 * The patient's latest visit, for the agent's top bar (name, "ปิดสิทธิ" and "OFC" badges).
 * - authCode: NHSO authentication, visit_pttype.auth_code (EP…/PP…) on any of the visit's rights (older agents).
 * - close: NHSO "ปิดสิทธิ" (confirm privilege after the service), nhso_confirm_privilege — one row per vn
 *   (8,322 rows / 8,322 visits in 30 days); nhso_status 'Y' = closed, 'C' = cancelled (nhso_cancel_datetime set).
 *   Mostly UCS: on 2026-11-05, 391 of 707 UCS visits were closed, 0 of 53 OFC. Only these columns are read:
 *   never nhso_request_json (it carries the patient's CID).
 * - hipdata = pttype.hipdata_code of the visit's main right (UCS, OFC, SSS, LGO …).
 * Driven from patient (PRIMARY hn) so the name comes back even without a visit.
 * Proven on bkhosxp 2026-11-06: ovst ref on ix_hn (~100 rows per patient), visit_pttype PRIMARY,
 * nhso_confirm_privilege ref on vn (1 row).
 */
const SQL = `SELECT TRIM(CONCAT(COALESCE(pt.pname, ''), COALESCE(pt.fname, ''), ' ', COALESCE(pt.lname, ''))) AS name,
    DATE_FORMAT(o.vstdate, '%Y-%m-%d') AS date,
    DATE_FORMAT(TIMESTAMP(o.vstdate, o.vsttime), '%Y-%m-%d %H:%i') AS visitAt,
    (SELECT TRIM(vp.auth_code) FROM visit_pttype vp WHERE vp.vn = o.vn AND TRIM(vp.auth_code) <> ''
     ORDER BY vp.pttype_number LIMIT 1) AS authCode,
    (SELECT p.hipdata_code FROM pttype p WHERE p.pttype = o.pttype) AS hipdata,
    c.nhso_status AS closeStatus, c.nhso_authen_code AS closeCode,
    DATE_FORMAT(c.nhso_response_datetime, '%Y-%m-%d %H:%i') AS closedAt,
    DATE_FORMAT(c.nhso_cancel_datetime, '%Y-%m-%d %H:%i') AS cancelledAt,
    c.nhso_total_amount AS total, c.nhso_privilege_amount AS privilege, c.nhso_cash_amount AS paid
  FROM patient pt
  LEFT JOIN ovst o ON o.vn = (SELECT v.vn FROM ovst v WHERE v.hn = pt.hn ORDER BY v.vstdate DESC, v.vsttime DESC LIMIT 1)
  LEFT JOIN nhso_confirm_privilege c ON c.nhso_confirm_privilege_id =
    (SELECT MAX(x.nhso_confirm_privilege_id) FROM nhso_confirm_privilege x WHERE x.vn = o.vn)
  WHERE pt.hn = ?`;

type Row = {
  name: string | null;
  date: string | null;
  visitAt: string | null;
  authCode: string | null;
  hipdata: string | null;
  closeStatus: string | null;
  closeCode: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  total: number | string | null;
  privilege: number | string | null;
  paid: number | string | null;
};
const num = (v: number | string | null) => (v == null ? null : Number(v));

/** GET /api/agent/authen?hn=<hn> — the latest visit's NHSO status (authen, ปิดสิทธิ), right and the patient's name. */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const hn = new URL(req.url).searchParams.get("hn")?.trim() ?? "";
  if (!/^\d{1,9}$/.test(hn)) return error(400, { error: "invalid_hn" });
  try {
    const [row] = await hisQuery<Row>(SQL, [hn]);
    const body: AgentAuthenResponse = {
      hn,
      name: row?.name || null,
      visitDate: row?.date ? String(row.date) : null,
      visitAt: row?.visitAt ? String(row.visitAt) : null,
      authCode: row?.authCode ?? null,
      hipdata: row?.hipdata ?? null,
      close:
        row?.closeStatus === "Y" || row?.closeStatus === "C"
          ? {
              status: row.closeStatus === "Y" ? "closed" : "cancelled",
              code: row.closeCode ?? null,
              closedAt: row.closedAt ?? null,
              cancelledAt: row.cancelledAt ?? null,
              total: num(row.total),
              privilege: num(row.privilege),
              paid: num(row.paid),
            }
          : null,
    };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/authen] HIS error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
