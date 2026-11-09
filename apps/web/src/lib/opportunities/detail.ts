import type { Opportunity } from "@bkh/shared";
import type { Condition } from "./conditions";

type Row = Record<string, string | number | null>;
type Detail = NonNullable<Opportunity["detail"]>;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Thai fiscal year end (30 Sep) of the year that contains `ymd` (the year starts 1 Oct). */
export function fyEnd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return `${m >= 10 ? y + 1 : y}-09-30`;
}

/** Highest age the condition still accepts; for `in` the patient's own (matching) age; null = no upper bound. */
function ageUpper(c: Condition, cell: number | null): number | null {
  const v = (c.value ?? "").split(",").map((s) => Number(s.trim()));
  if (c.op === "lte") return v[0];
  if (c.op === "lt") return v[0] - 1;
  if (c.op === "between") return v[1];
  if (c.op === "in") return cell;
  return null;
}

/**
 * Why a MATCHED opportunity matched, derived from its conditions and the row fetched for each one (rows[i] for
 * conditions[i]) — data only, no per-item code. `visitDate` ("YYYY-MM-DD") is the evaluated visit: the sources
 * count days_since / count_fy from it.
 * - basis: the patient's age from age_y / age_m conditions, and "GA N สัปดาห์" when a row has ga_weeks
 * - lastDone: from the row's days_since of each "not done" history condition (days_since gt/gte/gt_or_empty/empty,
 *   or count_fy "not this FY"), the most recent = visitDate − days; null = never (all NULL); undefined = the item
 *   has no such condition
 * - due: the fiscal year end when a count_fy condition means "not done this FY yet" (eq 0, lte 0, lt 1), else
 *   "ก่อนอายุครบ N ปี/เดือน" from the first age condition with an upper bound, else null
 */
export function opportunityDetail(conditions: Condition[], rows: (Row | null)[], visitDate: string): Detail {
  const basis = new Set<string>();
  const days: (number | null)[] = [];
  let ageDue: string | null = null;
  let fyDue = false;

  conditions.forEach((c, i) => {
    const row = rows[i];
    if (!row) return;
    const cell = num(row[c.column]);
    if (c.source === "patient" && (c.column === "age_y" || c.column === "age_m") && cell !== null) {
      const unit = c.column === "age_y" ? "ปี" : "เดือน";
      basis.add(`อายุ ${cell} ${unit}`);
      const upper = ageUpper(c, cell);
      if (ageDue === null && upper !== null && Number.isFinite(upper)) ageDue = `ก่อนอายุครบ ${upper + 1} ${unit}`;
    }
    const ga = num(row.ga_weeks);
    if (ga !== null) basis.add(`GA ${ga} สัปดาห์`);
    const v = c.value?.trim();
    const notThisFy = c.column === "count_fy" && (((c.op === "eq" || c.op === "lte") && v === "0") || (c.op === "lt" && v === "1"));
    if (notThisFy) fyDue = true;
    // only "not done (recently)" conditions date the service; e.g. diag E11 not_empty is eligibility, not the service
    if (notThisFy || (c.column === "days_since" && ["gt", "gte", "gt_or_empty", "empty"].includes(c.op))) days.push(num(row.days_since));
  });

  const known = days.filter((d): d is number => d !== null);
  let lastDone: string | null | undefined;
  if (days.length) {
    if (known.length) {
      const d = new Date(`${visitDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - Math.min(...known));
      lastDone = d.toISOString().slice(0, 10);
    } else lastDone = null;
  }

  return { basis: basis.size ? [...basis].join(", ") : null, lastDone, due: fyDue ? fyEnd(visitDate) : ageDue };
}
