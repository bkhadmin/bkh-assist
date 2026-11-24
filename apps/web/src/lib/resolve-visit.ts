import "server-only";
import type { VisitCandidate } from "@bkh/shared";
import { hisQuery } from "@/lib/his";

/**
 * Find the HOSxP visit (VN) the user just saved.
 *
 * SQL proven by prove-query on bkhosxp 2026-11-05 (index_merge ix_hn+ix_vstdate / range ix_vstdate).
 * Time-only search: `vstdate BETWEEN DATE(from) AND DATE(to)` keeps visits saved across midnight.
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
    "SELECT vn, hn, update_datetime AS updatedAt FROM opdscreen WHERE vn = ? LIMIT 1";
  const rows = await hisQuery<VisitCandidate>(sql, [vn]);
  return rows[0] ?? null;
}

/**
 * No vstdate filter: staff also edit and re-save past visits (e.g. yesterday's), and those must be found too.
 * Re-proven 2026-11-06: ref on ix_hn (~180 rows per patient), so the visit date is not needed for speed.
 * ovstdiag too: coding a past visit (งานเวชระเบียน, TPatientOPDVisitDiagnosisEntryForm) updates ovstdiag.update_datetime but
 * not opdscreen. 2026-11-24: 30 later coder edits found 30/30 (opdscreen alone 0/30), none ambiguous;
 * EXPLAIN ref on opdscreen.ix_hn and ovstdiag.hn, <= 41 ms.
 */
export async function findByHnAndTime(hn: string, from: string, to: string): Promise<VisitCandidate[]> {
  const sql = `SELECT vn, hn, MAX(updatedAt) AS updatedAt FROM (
      SELECT vn, hn, update_datetime AS updatedAt FROM opdscreen WHERE hn = ? AND update_datetime BETWEEN ? AND ?
      UNION ALL
      SELECT vn, hn, update_datetime AS updatedAt FROM ovstdiag WHERE hn = ? AND update_datetime BETWEEN ? AND ?
    ) x
    GROUP BY vn, hn
    ORDER BY updatedAt DESC
    LIMIT 11`;
  return hisQuery<VisitCandidate>(sql, [hn, from, to, hn, from, to]);
}

/**
 * shortcut: keeps the vstdate filter because opdscreen has no index on update_datetime (full scan of 3M rows
 * otherwise), so a past visit saved without a readable HN is not found. Upgrade if HN reading ever fails often.
 */
export async function findByTime(from: string, to: string): Promise<VisitCandidate[]> {
  const sql = `SELECT vn, hn, update_datetime AS updatedAt
    FROM opdscreen
    WHERE vstdate BETWEEN DATE(?) AND DATE(?)
      AND update_datetime BETWEEN ? AND ?
    ORDER BY update_datetime DESC
    LIMIT 11`;
  return hisQuery<VisitCandidate>(sql, [from, to, from, to]);
}

/**
 * The patient's visits on the dates of the visit list behind a งานเวชระเบียน diagnosis save (see VISIT_RANGE_AFTER_MS).
 * EXPLAIN: ref on ovst ix_hn. updatedAt = the visit date and time (there is no save time to show).
 */
export async function findByHnAndDates(hn: string, from: string, to: string): Promise<VisitCandidate[]> {
  const sql = `SELECT vn, hn, CONCAT(vstdate, ' ', vsttime) AS updatedAt
    FROM ovst
    WHERE hn = ? AND vstdate BETWEEN ? AND ?
    ORDER BY vstdate DESC, vsttime DESC
    LIMIT 11`;
  return hisQuery<VisitCandidate>(sql, [hn, from, to]);
}

/**
 * A diagnosis save that changed nothing writes nothing, so the save time never finds it. After this long without a
 * time match, the visit list's date filter + HN decide instead. Not at once: a save that does write must be checked
 * after HOSxP has written it (the agent polls every 2 s for 30 s).
 */
export const VISIT_RANGE_AFTER_MS = 8000;

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

/** vn given → use it; else hn + window around savedAt; else time-only window; then hn + visit list dates (see above). */
export async function resolveVisit(
  input: { vn?: string; hn?: string; savedAt: string; visitFrom?: string; visitTo?: string },
  now = Date.now(),
): Promise<Resolution> {
  if (input.vn) {
    const visit = await findByVn(input.vn);
    return visit ? { kind: "found", visit: normalize(visit) } : { kind: "not_found" };
  }

  const savedAt = new Date(input.savedAt);
  let candidates = input.hn
    ? await findByHnAndTime(input.hn, ...windowAround(savedAt, HN_WINDOW))
    : await findByTime(...windowAround(savedAt, TIME_ONLY_WINDOW));
  if (!candidates.length && input.hn && input.visitFrom && input.visitTo && now - savedAt.getTime() >= VISIT_RANGE_AFTER_MS) {
    const [from, to] = [input.visitFrom, input.visitTo].sort();
    candidates = await findByHnAndDates(input.hn, from, to);
  }

  // The same VN may come back more than once if the SQL joins several tables.
  const unique = [...new Map(candidates.map((c) => [str(c.vn), normalize(c)])).values()];
  if (unique.length === 0) return { kind: "not_found" };
  if (unique.length === 1) return { kind: "found", visit: unique[0] };
  return { kind: "ambiguous", candidates: unique.slice(0, MAX_CANDIDATES) };
}
