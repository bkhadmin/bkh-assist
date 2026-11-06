import type { AgentAuthenResponse, ApiError } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { hisQuery } from "@/lib/his";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/**
 * NHSO authentication of the patient's latest visit: visit_pttype.auth_code (EP…/PP… codes) set on any of
 * the visit's rights. 681 of 842 visits on 2026-11-05 had one. Proven on bkhosxp 2026-11-06: ref on
 * ovst.ix_hn (~100 rows per patient), dependent lookup on visit_pttype PRIMARY.
 * visit_pttype.Auth_DateTime is never filled (0 of 142,207 codes in 2569), so the visit time is returned instead.
 * hipdata = pttype.hipdata_code of the visit's main right (UCS, OFC, SSS, LGO …): the top bar flags OFC.
 * Driven from patient (PRIMARY hn) so the name comes back even without a visit.
 */
const SQL = `SELECT TRIM(CONCAT(COALESCE(pt.pname, ''), COALESCE(pt.fname, ''), ' ', COALESCE(pt.lname, ''))) AS name,
    DATE_FORMAT(o.vstdate, '%Y-%m-%d') AS date,
    DATE_FORMAT(TIMESTAMP(o.vstdate, o.vsttime), '%Y-%m-%d %H:%i') AS visitAt,
    (SELECT TRIM(vp.auth_code) FROM visit_pttype vp WHERE vp.vn = o.vn AND TRIM(vp.auth_code) <> ''
     ORDER BY vp.pttype_number LIMIT 1) AS authCode,
    (SELECT p.hipdata_code FROM pttype p WHERE p.pttype = o.pttype) AS hipdata
  FROM patient pt
  LEFT JOIN ovst o ON o.vn = (SELECT v.vn FROM ovst v WHERE v.hn = pt.hn ORDER BY v.vstdate DESC, v.vsttime DESC LIMIT 1)
  WHERE pt.hn = ?`;

/** GET /api/agent/authen?hn=<hn> — for the agent's top bar "Authen" and "OFC" badges. */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const hn = new URL(req.url).searchParams.get("hn")?.trim() ?? "";
  if (!/^\d{1,9}$/.test(hn)) return error(400, { error: "invalid_hn" });
  try {
    const [row] = await hisQuery<{ name: string | null; date: string | null; visitAt: string | null; authCode: string | null; hipdata: string | null }>(SQL, [hn]);
    const body: AgentAuthenResponse = {
      hn,
      name: row?.name || null,
      visitDate: row?.date ? String(row.date) : null,
      visitAt: row?.visitAt ? String(row.visitAt) : null,
      authCode: row?.authCode ?? null,
      hipdata: row?.hipdata ?? null,
    };
    return Response.json(body);
  } catch (err) {
    // privacy: no HN in the log
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    console.error("[agent/authen] HIS error", (cause as { code?: string } | null)?.code ?? "unknown");
    return error(502, { error: "his_unavailable" });
  }
}
