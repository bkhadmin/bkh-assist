import "server-only";
import type { CheckResponse, RuleResult } from "@bkh/shared";
import { assistQuery, assistTransaction } from "@/lib/assist";
import type { Module } from "@/lib/rules/types";

/**
 * Persistence around a check, in the assist DB. Every function here is best-effort:
 * if the assist DB is down, the agent still gets its answer from HIS.
 */

function warn(what: string, err: unknown) {
  const code = (err as { code?: string } | null)?.code ?? (err instanceof Error ? err.message : "unknown");
  console.error(`[assist] ${what} failed`, code);
}

/** Register the machine on first contact and mark it seen. Returns its id, or null if the DB is unavailable. */
export async function touchMachine(machineName: string): Promise<number | null> {
  try {
    const rows = await assistQuery<{ id: string }>(
      `INSERT INTO machines (machine_name, last_seen_at) VALUES ($1, now())
       ON CONFLICT (machine_name) DO UPDATE SET last_seen_at = now()
       RETURNING id`,
      [machineName],
    );
    return Number(rows[0].id);
  } catch (err) {
    warn("touchMachine", err);
    return null;
  }
}

/** What the admin page set for this machine: is it active, and which active modules does it check. */
export async function machineConfig(machineId: number) {
  const [machine] = await assistQuery<{ is_active: boolean }>("SELECT is_active FROM machines WHERE id = $1", [machineId]);
  const modules = await assistQuery<{ code: string; label: string; hosxp_form: string | null }>(
    `SELECT m.code, m.label, m.hosxp_form FROM machine_modules mm JOIN modules m ON m.code = mm.module_code
     WHERE mm.machine_id = $1 AND m.is_active ORDER BY m.label`,
    [machineId],
  );
  return {
    active: machine?.is_active ?? true,
    modules: modules.map((m) => ({ code: m.code, label: m.label, hosxpForm: m.hosxp_form })),
  };
}

/**
 * May this machine run this module? Denied when an admin switched the machine or module off, or the
 * module is not assigned to the machine. Allowed when the assist DB is unavailable (checks keep working).
 */
export async function isModuleAllowed(machineId: number | null, moduleCode: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (machineId == null) return { ok: true };
  try {
    const cfg = await machineConfig(machineId);
    if (!cfg.active) return { ok: false, reason: "machine_disabled" };
    if (!cfg.modules.some((m) => m.code === moduleCode)) return { ok: false, reason: "module_not_enabled" };
    return { ok: true };
  } catch (err) {
    warn("isModuleAllowed", err);
    return { ok: true };
  }
}

type RuleSettingRow = { rule_code: string; is_active: boolean; severity: "error" | "warning" | null; sort_order: number | null };

/**
 * Apply admin switches from rule_settings to a code-defined module: drop disabled rules,
 * override severity, order by sort_order. Falls back to code defaults if the DB is unavailable.
 */
export async function withRuleSettings(mod: Module): Promise<Module> {
  let rows: RuleSettingRow[];
  try {
    rows = await assistQuery<RuleSettingRow>(
      "SELECT rule_code, is_active, severity, sort_order FROM rule_settings WHERE module_code = $1",
      [mod.code],
    );
  } catch (err) {
    warn("withRuleSettings", err);
    return mod;
  }
  const byCode = new Map(rows.map((r) => [r.rule_code, r]));
  const order = (code: string, i: number) => byCode.get(code)?.sort_order ?? 10_000 + i;
  const rules = mod.rules
    .map((rule, i) => ({ rule, i, s: byCode.get(rule.code) }))
    .filter(({ s }) => s?.is_active !== false)
    .sort((a, b) => order(a.rule.code, a.i) - order(b.rule.code, b.i))
    .map(({ rule, s }) => (s?.severity ? { ...rule, severity: s.severity } : rule));
  return { ...mod, rules };
}

const failed = (results: RuleResult[]) =>
  results.filter((r) => !r.passed).map(({ code, label, severity }) => ({ code, label, severity }));

/**
 * Log a final check result and keep pending_issues in sync:
 * missing -> open/update the visit's issue, ok -> resolve it.
 * "not_found" is not logged: the agent polls with it every 2 s while HOSxP is still saving.
 */
export async function recordCheck(input: {
  machineId: number | null;
  machineName: string;
  moduleCode: string;
  savedAt: string;
  res: CheckResponse;
}): Promise<void> {
  const { machineId, machineName, moduleCode, savedAt, res } = input;
  if (res.status === "not_found") return;
  const missing = failed(res.results);
  try {
    await assistTransaction(async (db) => {
      await db.query(
        `INSERT INTO check_logs (saved_at, machine_id, machine_name, module_code, vn, hn, status, missing)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [savedAt, machineId, machineName, moduleCode, res.vn ?? null, res.hn ?? null, res.status, JSON.stringify(missing)],
      );
      if (!res.vn || !res.hn) return;
      if (res.status === "missing") {
        await db.query(
          `INSERT INTO pending_issues (vn, hn, module_code, missing, last_machine_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (vn, module_code) DO UPDATE SET
             missing = EXCLUDED.missing, last_checked_at = now(),
             last_machine_id = EXCLUDED.last_machine_id, resolved_at = NULL`,
          [res.vn, res.hn, moduleCode, JSON.stringify(missing), machineId],
        );
      } else if (res.status === "ok") {
        await db.query(
          `UPDATE pending_issues SET resolved_at = now(), last_checked_at = now(), missing = '[]'::jsonb,
             last_machine_id = $3
           WHERE vn = $1 AND module_code = $2 AND resolved_at IS NULL`,
          [res.vn, moduleCode, machineId],
        );
      }
    });
  } catch (err) {
    warn("recordCheck", err);
  }
}
