import "server-only";
import { assistQuery } from "@/lib/assist";
import type { Condition } from "@/lib/opportunities/conditions";
import { SOURCES, getSource } from "@/lib/opportunities/sources";
import { getModule, listModules as listCodeModules } from "@/lib/rules/modules";

/**
 * Read models for the admin pages. A module is defined twice on purpose:
 * - in code (apps/web/src/lib/rules/modules): rule labels, default severity and the proven SQL
 * - in the assist DB: switches an admin may change (active, label, severity, order, machines)
 */

export type ModuleRow = {
  code: string;
  label: string;
  description: string | null;
  hosxpForm: string | null;
  isActive: boolean;
  /** false = no rules in code for this code; the module cannot run until a developer adds them */
  hasCode: boolean;
  rulesTotal: number;
  rulesActive: number;
  machines: number;
  checks7d: number;
  missing7d: number;
};

export async function listModules(): Promise<ModuleRow[]> {
  const rows = await assistQuery<{
    code: string;
    label: string;
    description: string | null;
    hosxp_form: string | null;
    is_active: boolean;
    machines: string;
    checks7d: string;
    missing7d: string;
    inactive_rules: string[];
  }>(
    `SELECT m.code, m.label, m.description, m.hosxp_form, m.is_active,
            (SELECT count(*) FROM machine_modules mm WHERE mm.module_code = m.code) AS machines,
            (SELECT count(*) FROM check_logs c WHERE c.module_code = m.code AND c.checked_at > now() - interval '7 days') AS checks7d,
            (SELECT count(*) FROM check_logs c WHERE c.module_code = m.code AND c.status = 'missing'
               AND c.checked_at > now() - interval '7 days') AS missing7d,
            coalesce((SELECT array_agg(rule_code) FROM rule_settings r WHERE r.module_code = m.code AND NOT r.is_active), '{}') AS inactive_rules
     FROM modules m
     ORDER BY m.label`,
  );
  return rows.map((r) => {
    const code = getModule(r.code);
    const inactive = new Set(r.inactive_rules);
    const rules = code?.rules ?? [];
    return {
      code: r.code,
      label: r.label,
      description: r.description,
      hosxpForm: r.hosxp_form,
      isActive: r.is_active,
      hasCode: Boolean(code),
      rulesTotal: rules.length,
      rulesActive: rules.filter((x) => !inactive.has(x.code)).length,
      machines: Number(r.machines),
      checks7d: Number(r.checks7d),
      missing7d: Number(r.missing7d),
    };
  });
}

/** Modules that exist in code but have no DB row yet (a developer added them; an admin must register them). */
export async function unregisteredCodeModules() {
  const rows = await assistQuery<{ code: string }>("SELECT code FROM modules");
  const known = new Set(rows.map((r) => r.code));
  return listCodeModules().filter((m) => !known.has(m.code));
}

export type RuleRow = {
  code: string;
  label: string;
  sql: string;
  defaultSeverity: "error" | "warning";
  severity: "error" | "warning";
  severityOverridden: boolean;
  isActive: boolean;
  sortOrder: number;
  fails7d: number;
};

export type ModuleDetail = Omit<ModuleRow, "rulesTotal" | "rulesActive"> & {
  rules: RuleRow[];
  machineList: { id: number; name: string; displayName: string | null }[];
  opportunitiesEnabled: boolean;
  opportunityCodes: string[];
};

export async function getModuleDetail(code: string): Promise<ModuleDetail | null> {
  const [mod] = (await listModules()).filter((m) => m.code === code);
  if (!mod) return null;

  const [settings, fails, machines, [opp]] = await Promise.all([
    assistQuery<{ rule_code: string; is_active: boolean; severity: "error" | "warning" | null; sort_order: number | null }>(
      "SELECT rule_code, is_active, severity, sort_order FROM rule_settings WHERE module_code = $1",
      [code],
    ),
    assistQuery<{ rule_code: string; n: string }>(
      `SELECT f->>'code' AS rule_code, count(*) AS n
       FROM check_logs c, jsonb_array_elements(c.missing) f
       WHERE c.module_code = $1 AND c.checked_at > now() - interval '7 days'
       GROUP BY 1`,
      [code],
    ),
    assistQuery<{ id: string; machine_name: string; display_name: string | null }>(
      `SELECT m.id, m.machine_name, m.display_name FROM machines m
       JOIN machine_modules mm ON mm.machine_id = m.id WHERE mm.module_code = $1 ORDER BY m.machine_name`,
      [code],
    ),
    assistQuery<{ opportunities_enabled: boolean; codes: string[] }>(
      `SELECT opportunities_enabled,
              coalesce((SELECT array_agg(opportunity_code) FROM module_opportunities WHERE module_code = $1), '{}') AS codes
       FROM modules WHERE code = $1`,
      [code],
    ),
  ]);
  const byCode = new Map(settings.map((s) => [s.rule_code, s]));
  const failsByCode = new Map(fails.map((f) => [f.rule_code, Number(f.n)]));

  const rules: RuleRow[] = (getModule(code)?.rules ?? [])
    .map((r, i) => {
      const s = byCode.get(r.code);
      return {
        code: r.code,
        label: r.label,
        sql: r.sql,
        defaultSeverity: r.severity,
        severity: s?.severity ?? r.severity,
        severityOverridden: Boolean(s?.severity),
        isActive: s?.is_active ?? true,
        sortOrder: s?.sort_order ?? 10_000 + i,
        fails7d: failsByCode.get(r.code) ?? 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    ...mod,
    rules,
    machineList: machines.map((m) => ({ id: Number(m.id), name: m.machine_name, displayName: m.display_name })),
    opportunitiesEnabled: opp?.opportunities_enabled ?? false,
    opportunityCodes: opp?.codes ?? [],
  };
}

export type OpportunityRow = {
  code: string;
  category: string;
  groupName: string | null;
  label: string;
  description: string | null;
  conditions: Condition[];
  isActive: boolean;
  sortOrder: number;
  /** HOSxP items billed for it (price shown by the agent) */
  icodes: string[];
  /** baht, manual price (e.g. NHSO lump sum) shown instead of the icode price sum; null = use the icodes */
  price: number | null;
  /** checks in the last 7 days that showed this opportunity */
  matches7d: number;
  /** modules that have it ticked (whether or not their add-on switch is on) */
  modules: number;
};

export async function listOpportunities(): Promise<OpportunityRow[]> {
  const rows = await assistQuery<{
    code: string;
    category: string;
    group_name: string | null;
    label: string;
    description: string | null;
    conditions: Condition[];
    is_active: boolean;
    sort_order: number;
    icodes: string[];
    price: number | null;
    matches7d: string | null;
    modules: string;
  }>(
    `SELECT o.code, o.category, o.group_name, o.label, o.description, o.conditions, o.is_active, o.sort_order, o.icodes, o.price::float8 AS price, h.n AS matches7d,
            (SELECT count(*) FROM module_opportunities mo WHERE mo.opportunity_code = o.code) AS modules
     FROM opportunities o
     LEFT JOIN (SELECT x AS code, count(*) AS n FROM check_logs c, jsonb_array_elements_text(c.opportunities) x
                WHERE c.checked_at > now() - interval '7 days' GROUP BY 1) h ON h.code = o.code
     ORDER BY o.category, o.sort_order, o.code`,
  );
  return rows.map((r) => ({
    code: r.code,
    category: r.category,
    groupName: r.group_name,
    label: r.label,
    description: r.description,
    conditions: r.conditions,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    icodes: r.icodes,
    price: r.price,
    matches7d: Number(r.matches7d ?? 0),
    modules: Number(r.modules),
  }));
}

export type RluRow = {
  code: string;
  label: string;
  description: string | null;
  labCodes: string[];
  conditions: Condition[];
  message: string | null;
  isActive: boolean;
  sortOrder: number;
};

/** RLU items in agent order (see db/migrations/202611071000_rlu.sql). */
export async function listRluItems(): Promise<RluRow[]> {
  const rows = await assistQuery<{
    code: string;
    label: string;
    description: string | null;
    lab_codes: string[];
    conditions: Condition[];
    message: string | null;
    is_active: boolean;
    sort_order: number;
  }>(
    `SELECT code, label, description, lab_codes, conditions, message, is_active, sort_order
     FROM rlu_items ORDER BY sort_order, code`,
  );
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    description: r.description,
    labCodes: r.lab_codes,
    conditions: r.conditions,
    message: r.message,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }));
}

/** Category -> group, keeping the order of the rows (already sorted by category, sort_order). */
export function groupOpportunities<T extends { category: string; groupName: string | null }>(rows: T[]) {
  const out: { category: string; groups: { name: string | null; items: T[] }[] }[] = [];
  for (const r of rows) {
    let c = out.find((x) => x.category === r.category);
    if (!c) out.push((c = { category: r.category, groups: [] }));
    let g = c.groups.find((x) => x.name === r.groupName);
    if (!g) c.groups.push((g = { name: r.groupName, items: [] }));
    g.items.push(r);
  }
  return out;
}

/** Data sources as plain data for the client form (`build` and the RegExp are not serializable). */
export type SourceOption = {
  code: string;
  label: string;
  description: string;
  param?: { label: string; hint: string; pattern: string };
  columns: { name: string; label: string; type: "number" | "text" }[];
};

export const sourceOptions = (): SourceOption[] =>
  SOURCES.map(({ code, label, description, param, columns }) => ({
    code,
    label,
    description,
    param: param && { label: param.label, hint: param.hint, pattern: param.pattern.source },
    columns,
  }));

/** Column label from code for describe(); a stale source/column shows its raw name. */
export const columnLabel = (c: Condition) =>
  getSource(c.source)?.columns.find((x) => x.name === c.column)?.label ?? `${c.source}.${c.column}`;

export type MachineRow = {
  id: number;
  name: string;
  displayName: string | null;
  department: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  /** seconds since the agent last reported (computed by the DB, so render stays pure) */
  seenSecondsAgo: number | null;
  modules: string[];
  checksToday: number;
};

export async function listMachines(): Promise<MachineRow[]> {
  const rows = await assistQuery<{
    id: string;
    machine_name: string;
    display_name: string | null;
    department: string | null;
    is_active: boolean;
    last_seen_at: string | null;
    seen_seconds_ago: number | null;
    modules: string[];
    checks_today: string;
  }>(
    `SELECT m.id, m.machine_name, m.display_name, m.department, m.is_active, m.last_seen_at,
            extract(epoch FROM now() - m.last_seen_at)::int AS seen_seconds_ago,
            coalesce((SELECT array_agg(module_code ORDER BY module_code) FROM machine_modules mm WHERE mm.machine_id = m.id), '{}') AS modules,
            (SELECT count(*) FROM check_logs c WHERE c.machine_id = m.id AND c.checked_at >= date_trunc('day', now())) AS checks_today
     FROM machines m
     ORDER BY m.is_active DESC, m.last_seen_at DESC NULLS LAST, m.machine_name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.machine_name,
    displayName: r.display_name,
    department: r.department,
    isActive: r.is_active,
    lastSeenAt: r.last_seen_at,
    seenSecondsAgo: r.seen_seconds_ago,
    modules: r.modules,
    checksToday: Number(r.checks_today),
  }));
}

export async function moduleOptions() {
  return assistQuery<{ code: string; label: string; is_active: boolean; hosxp_form: string | null }>(
    "SELECT code, label, is_active, hosxp_form FROM modules ORDER BY label",
  );
}

export type Overview = {
  checksToday: number;
  missingToday: number;
  openIssues: number;
  machinesOnline: number;
  machinesTotal: number;
  topMissing: { label: string; n: number }[];
};

export async function getOverview(): Promise<Overview> {
  const [[c], top] = await Promise.all([
    assistQuery<{ checks: string; missing: string; open: string; online: string; machines: string }>(
      `SELECT
         (SELECT count(*) FROM check_logs WHERE checked_at >= date_trunc('day', now())) AS checks,
         (SELECT count(*) FROM check_logs WHERE checked_at >= date_trunc('day', now()) AND status = 'missing') AS missing,
         (SELECT count(*) FROM pending_issues WHERE resolved_at IS NULL) AS open,
         (SELECT count(*) FROM machines WHERE is_active AND last_seen_at > now() - interval '15 minutes') AS online,
         (SELECT count(*) FROM machines WHERE is_active) AS machines`,
    ),
    assistQuery<{ label: string; n: string }>(
      `SELECT f->>'label' AS label, count(*) AS n
       FROM check_logs c, jsonb_array_elements(c.missing) f
       WHERE c.checked_at >= date_trunc('day', now())
       GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
    ),
  ]);
  return {
    checksToday: Number(c.checks),
    missingToday: Number(c.missing),
    openIssues: Number(c.open),
    machinesOnline: Number(c.online),
    machinesTotal: Number(c.machines),
    topMissing: top.map((t) => ({ label: t.label, n: Number(t.n) })),
  };
}
