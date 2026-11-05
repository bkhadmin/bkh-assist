import "server-only";
import type { RuleResult } from "@bkh/shared";
import { hisQuery } from "@/lib/his";
import type { Module } from "./types";

type OkRow = { ok: number | string | null };

/**
 * Run every rule of `mod` against one visit. Rules run sequentially so one check holds
 * at most one HIS connection (the pool is small and shared by all agents).
 * A rule whose query throws makes the whole check throw — never report a false "ok".
 */
export async function runRules(mod: Module, vn: string): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  for (const rule of mod.rules) {
    let rows: OkRow[];
    try {
      rows = await hisQuery<OkRow>(rule.sql, [vn]);
    } catch (err) {
      throw new Error(`rule ${rule.code} failed`, { cause: err });
    }
    const passed = rows.length > 0 && Number(rows[0].ok) === 1;
    results.push({ code: rule.code, label: rule.label, passed, severity: rule.severity });
  }
  return results;
}
