import "server-only";
import type { Opportunity } from "@bkh/shared";
import { hisQuery } from "@/lib/his";
import { matches, type Condition } from "./conditions";
import { getSource } from "./sources";

export type OpportunityDef = Opportunity & { conditions: Condition[]; icodes?: string[] };

type Row = Record<string, string | number | null>;

/**
 * Which opportunities does this visit match? Conditions are checked in order and an opportunity stops at its
 * first failing condition, so cheap patient filters (age, sex) placed first skip the history queries.
 * Each distinct source+codes query runs at most once per check, sequentially (one HIS connection at a time).
 * Never throws: an opportunity whose query fails is skipped and logged, the validation result is not affected.
 */
export async function evaluateOpportunities(defs: OpportunityDef[], vn: string): Promise<Opportunity[]> {
  const cache = new Map<string, Promise<Row | null>>();
  const fetchRow = (c: Condition) => {
    const key = `${c.source}|${(c.codes ?? []).join(",")}`;
    let row = cache.get(key);
    if (!row) {
      const src = getSource(c.source)!;
      const { sql, params } = src.build(c.codes ?? [], vn);
      row = hisQuery<Row>(sql, params).then((rows) => rows[0] ?? null);
      cache.set(key, row);
    }
    return row;
  };

  const hits: Opportunity[] = [];
  for (const def of defs) {
    try {
      if (def.conditions.length === 0) continue; // an opportunity without conditions would match every visit
      let ok = true;
      for (const c of def.conditions) {
        const src = getSource(c.source);
        const col = src?.columns.find((x) => x.name === c.column);
        if (!src || !col || (src.param && !c.codes?.length)) {
          ok = false; // stale definition (source/column renamed in code): never match
          break;
        }
        const row = await fetchRow(c);
        if (!row || !matches(c, row[c.column], col.type === "number")) {
          ok = false;
          break;
        }
      }
      if (ok) hits.push({ code: def.code, category: def.category, label: def.label });
    } catch (err) {
      const cause = err instanceof Error ? (err.cause ?? err) : err;
      console.error("[opportunities]", JSON.stringify({ vn, opportunity: def.code, error: (cause as { code?: string })?.code ?? String(cause) }));
    }
  }
  return hits;
}
