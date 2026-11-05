import "server-only";
import type { VisitCandidate } from "@bkh/shared";
import { hisQuery } from "@/lib/his";

/**
 * Find the HOSxP visit (VN) the user just saved.
 *
 * SQL proven by prove-query on bkhosxp 2026-11-05 (index_merge ix_hn+ix_vstdate / range ix_vstdate).
 * `vstdate BETWEEN DATE(from) AND DATE(to)` keeps visits saved across midnight.
 * Rows carry only vn, hn, updatedAt ("YYYY-MM-DD HH:mm:ss", HIS local time) — never names/CID.
 *
 * Timing (PoC 2026-11-05): HOSxP writes opdscreen ~5 s AFTER the "บันทึก" click, because a
 * confirm dialog ("ยืนยัน [F9]") comes first. So the window starts just before savedAt and the
 * agent polls until the row shows up; looking back further would match the previous save of the
 * same visit and check stale data.
 */

/** HOSxP stores DATETIME in hospital local time (Asia/Bangkok, UTC+7, no DST). */
const HIS_UTC_OFFSET_MINUTES = 7 * 60;

/** Window around savedAt when HN is known (2 s slack for clock skew between PC and DB server). */
export const HN_WINDOW = { beforeSec: 2, afterSec: 2 * 60 } as const;
/** Time-only fallback must stay narrow, otherwise every busy minute is "ambiguous". */
export const TIME_ONLY_WINDOW = { beforeSec: 2, afterSec: 30 } as const;

/** Max candidates returned to the agent for an ambiguous match. */
const MAX_CANDIDATES = 10;

/** Format an instant as a HIS-local DATETIME string, e.g. "2026-11-05 09:15:00". */
export function toHisDateTime(d: Date): string {
  return new Date(d.getTime() + HIS_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

function windowAround(savedAt: Date, w: { beforeSec: number; afterSec: number }): [string, string] {
  return [
    toHisDateTime(new Date(savedAt.getTime() - w.beforeSec * 1000)),
    toHisDateTime(new Date(savedAt.getTime() + w.afterSec * 1000)),
  ];
}

export async function findByVn(vn: string): Promise<VisitCandidate | null> {
  const sql =
    "SELECT vn, hn, update_datetime AS updatedAt FROM opdscreen WHERE vn = ? AND vstdate = CURDATE() LIMIT 1";
  const rows = await hisQuery<VisitCandidate>(sql, [vn]);
  return rows[0] ?? null;
}

export async function findByHnAndTime(hn: string, from: string, to: string): Promise<VisitCandidate[]> {
  const sql = `SELECT vn, hn, update_datetime AS updatedAt
    FROM opdscreen
    WHERE hn = ?
      AND vstdate BETWEEN DATE(?) AND DATE(?)
      AND update_datetime BETWEEN ? AND ?
    ORDER BY update_datetime DESC
    LIMIT 11`;
  return hisQuery<VisitCandidate>(sql, [hn, from, to, from, to]);
}

export async function findByTime(from: string, to: string): Promise<VisitCandidate[]> {
  const sql = `SELECT vn, hn, update_datetime AS updatedAt
    FROM opdscreen
    WHERE vstdate BETWEEN DATE(?) AND DATE(?)
      AND update_datetime BETWEEN ? AND ?
    ORDER BY update_datetime DESC
    LIMIT 11`;
  return hisQuery<VisitCandidate>(sql, [from, to, from, to]);
}

export type Resolution =
  | { kind: "found"; visit: VisitCandidate }
  | { kind: "not_found" }
  | { kind: "ambiguous"; candidates: VisitCandidate[] };

const str = (v: unknown) => (v == null ? "" : String(v));
const normalize = (c: VisitCandidate): VisitCandidate => ({
  vn: str(c.vn),
  hn: str(c.hn),
  updatedAt: str(c.updatedAt),
});

/** vn given → use it; else hn + window around savedAt; else time-only window. */
export async function resolveVisit(input: { vn?: string; hn?: string; savedAt: string }): Promise<Resolution> {
  if (input.vn) {
    const visit = await findByVn(input.vn);
    return visit ? { kind: "found", visit: normalize(visit) } : { kind: "not_found" };
  }

  const savedAt = new Date(input.savedAt);
  const candidates = input.hn
    ? await findByHnAndTime(input.hn, ...windowAround(savedAt, HN_WINDOW))
    : await findByTime(...windowAround(savedAt, TIME_ONLY_WINDOW));

  // The same VN may come back more than once if the SQL joins several tables.
  const unique = [...new Map(candidates.map((c) => [str(c.vn), normalize(c)])).values()];
  if (unique.length === 0) return { kind: "not_found" };
  if (unique.length === 1) return { kind: "found", visit: unique[0] };
  return { kind: "ambiguous", candidates: unique.slice(0, MAX_CANDIDATES) };
}
