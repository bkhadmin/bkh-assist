"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assistExecute, assistQuery, assistTransaction } from "@/lib/assist";
import { ConditionSchema, NO_VALUE_OPS, type Condition } from "@/lib/opportunities/conditions";
import { getSource } from "@/lib/opportunities/sources";
import { getModule } from "@/lib/rules/modules";

/**
 * Admin mutations. Each action re-checks the session (proxy.ts and the admin layout are not the only gate)
 * and validates its input. Rule SQL is never editable here: it lives in code and is proven by prove-query.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "admin") throw new Error("forbidden");
}

const fail = (error: string): ActionResult => ({ ok: false, error });

const ModuleInput = z.object({
  code: z.string().min(1).max(50),
  label: z.string().trim().min(1, "ต้องมีชื่อ module").max(100),
  description: z.string().trim().max(500),
});

export async function saveModule(input: z.input<typeof ModuleInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = ModuleInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const { code, label, description } = p.data;
  await assistExecute("UPDATE modules SET label = $2, description = nullif($3, ''), updated_at = now() WHERE code = $1", [
    code,
    label,
    description,
  ]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setModuleActive(code: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  await assistExecute("UPDATE modules SET is_active = $2, updated_at = now() WHERE code = $1", [code, Boolean(isActive)]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Register a module that exists in code but not in the DB yet (with all its rules switched on). */
export async function registerModule(code: string): Promise<ActionResult> {
  await requireAdmin();
  const mod = getModule(code);
  if (!mod) return fail("ไม่พบ module นี้ในโค้ด");
  await assistTransaction(async (db) => {
    await db.query("INSERT INTO modules (code, label) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING", [mod.code, mod.label]);
    for (const [i, r] of mod.rules.entries()) {
      await db.query(
        "INSERT INTO rule_settings (rule_code, module_code, sort_order) VALUES ($1, $2, $3) ON CONFLICT (rule_code) DO NOTHING",
        [r.code, mod.code, (i + 1) * 10],
      );
    }
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const RuleInput = z.object({
  moduleCode: z.string().min(1).max(50),
  ruleCode: z.string().min(1).max(100),
  isActive: z.boolean(),
  severity: z.enum(["error", "warning"]),
});

/** Severity equal to the code default is stored as NULL, so a later change of the default in code still applies. */
export async function saveRule(input: z.input<typeof RuleInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = RuleInput.safeParse(input);
  if (!p.success) return fail("ข้อมูลไม่ถูกต้อง");
  const { moduleCode, ruleCode, isActive, severity } = p.data;
  const rule = getModule(moduleCode)?.rules.find((r) => r.code === ruleCode);
  if (!rule) return fail("ไม่พบกฎนี้ในโค้ด");
  await assistExecute(
    `INSERT INTO rule_settings (rule_code, module_code, is_active, severity, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (rule_code) DO UPDATE SET is_active = $3, severity = $4, updated_at = now()`,
    [ruleCode, moduleCode, isActive, severity === rule.severity ? null : severity],
  );
  revalidatePath(`/admin/modules/${moduleCode}`);
  revalidatePath("/admin/modules");
  return { ok: true };
}

/** Persist the order shown in the admin table (10, 20, 30 … so a manual insert in SQL still fits between). */
export async function saveRuleOrder(moduleCode: string, ruleCodes: string[]): Promise<ActionResult> {
  await requireAdmin();
  const known = new Set(getModule(moduleCode)?.rules.map((r) => r.code));
  if (!ruleCodes.every((c) => known.has(c))) return fail("ข้อมูลไม่ถูกต้อง");
  await assistTransaction(async (db) => {
    for (const [i, code] of ruleCodes.entries()) {
      await db.query(
        `INSERT INTO rule_settings (rule_code, module_code, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (rule_code) DO UPDATE SET sort_order = $3, updated_at = now()`,
        [code, moduleCode, (i + 1) * 10],
      );
    }
  });
  revalidatePath(`/admin/modules/${moduleCode}`);
  return { ok: true };
}

const MachineInput = z.object({
  id: z.number().int().positive(),
  displayName: z.string().trim().max(100),
  department: z.string().trim().max(100),
  isActive: z.boolean(),
  modules: z.array(z.string().min(1).max(50)).max(50),
});

export async function saveMachine(input: z.input<typeof MachineInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = MachineInput.safeParse(input);
  if (!p.success) return fail("ข้อมูลไม่ถูกต้อง");
  const { id, displayName, department, isActive, modules } = p.data;
  // One module per HOSxP screen per machine: modules on the same form are triggered by the same save button,
  // so e.g. Doctorcheck on a nurse's screening save would always complain that there is no diagnosis yet.
  if (modules.length > 1) {
    const rows = await assistQuery<{ hosxp_form: string; labels: string[] }>(
      `SELECT hosxp_form, array_agg(label ORDER BY label) AS labels FROM modules
       WHERE code = ANY($1::text[]) AND hosxp_form IS NOT NULL GROUP BY hosxp_form HAVING count(*) > 1`,
      [modules],
    );
    if (rows.length) return fail(`เลือกได้ module เดียวต่อหน้าจอ HOSxP: ${rows[0].labels.join(" กับ ")} ใช้หน้าจอเดียวกัน`);
  }
  await assistTransaction(async (db) => {
    await db.query(
      `UPDATE machines SET display_name = nullif($2, ''), department = nullif($3, ''), is_active = $4, updated_at = now()
       WHERE id = $1`,
      [id, displayName, department, isActive],
    );
    await db.query("DELETE FROM machine_modules WHERE machine_id = $1", [id]);
    if (modules.length) {
      // unknown module codes are dropped by the join instead of failing the whole save
      await db.query(
        `INSERT INTO machine_modules (machine_id, module_code)
         SELECT $1, code FROM modules WHERE code = ANY($2::text[])`,
        [id, modules],
      );
    }
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const OpportunityInput = z.object({
  isNew: z.boolean(),
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_.]{1,49}$/, "รหัสต้องเป็นตัวพิมพ์ใหญ่ ตัวเลข _ หรือ . ขึ้นต้นด้วยตัวอักษร 2–50 ตัว"),
  category: z.string().trim().min(1, "ต้องมีหมวด").max(50),
  groupName: z.string().trim().max(100),
  label: z.string().trim().min(1, "ต้องมีข้อความแจ้งหน้างาน").max(200),
  description: z.string().trim().max(500),
  sortOrder: z.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
  // trust boundary: bound as SQL params on HIS by /api/agent/opportunities
  icodes: z.array(z.string().trim().regex(/^[0-9A-Za-z]{1,15}$/, "icode ต้องเป็นตัวอักษรหรือตัวเลข")).max(20).default([]),
  // baht as typed in the form; empty = no manual price (use the icodes)
  price: z
    .string()
    .trim()
    .regex(/^(\d{0,7}(\.\d{1,2})?)?$/, "ราคาเหมาจ่ายต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง")
    .transform((x) => (x === "" ? null : Number(x)))
    .refine((x) => x == null || x <= 1_000_000, "ราคาเหมาจ่ายต้องไม่เกิน 1,000,000 บาท"),
  conditions: z.array(ConditionSchema).min(1, "ต้องมีอย่างน้อย 1 เงื่อนไข").max(20),
});

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Check one condition against the sources in code and normalise it (trimmed, deduped codes; value as "a,b").
 * Trust boundary: the codes become bound SQL params on HIS, so they must match the source's pattern.
 */
function checkCondition(c: Condition, n: number): Condition | string {
  const src = getSource(c.source);
  if (!src) return `เงื่อนไขที่ ${n}: ไม่พบแหล่งข้อมูล`;
  const col = src.columns.find((x) => x.name === c.column);
  if (!col) return `เงื่อนไขที่ ${n}: ไม่พบคอลัมน์นี้ในแหล่งข้อมูล ${src.label}`;

  let codes: string[] | undefined;
  if (src.param) {
    codes = [...new Set((c.codes ?? []).map((x) => x.trim()).filter(Boolean))];
    if (!codes.length) return `เงื่อนไขที่ ${n}: ต้องใส่${src.param.label}`;
    const bad = codes.filter((x) => !src.param!.pattern.test(x));
    if (bad.length) return `เงื่อนไขที่ ${n}: ${src.param.label} ไม่ถูกต้อง: ${bad.join(", ")}`;
  } else if (c.codes?.length) return `เงื่อนไขที่ ${n}: แหล่งข้อมูล ${src.label} ไม่รับรหัส`;

  if (NO_VALUE_OPS.includes(c.op)) return { source: c.source, codes, column: c.column, op: c.op };

  const list = (c.value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const isList = c.op === "in" || c.op === "not_in" || c.op === "between";
  if (!list.length) return `เงื่อนไขที่ ${n}: ต้องใส่ค่า`;
  if (!isList && list.length > 1) return `เงื่อนไขที่ ${n}: ใส่ค่าได้ค่าเดียว`;
  if (c.op === "between" && list.length !== 2) return `เงื่อนไขที่ ${n}: "อยู่ระหว่าง" ต้องใส่ 2 ค่า เช่น 30, 59`;
  // matches() compares text only for eq/ne/in/not_in; every other op compares numbers
  const numeric = col.type === "number" || !["eq", "ne", "in", "not_in"].includes(c.op);
  if (numeric && !list.every((x) => NUMBER.test(x))) return `เงื่อนไขที่ ${n}: ค่าต้องเป็นตัวเลข`;
  if (c.op === "between" && Number(list[0]) > Number(list[1])) return `เงื่อนไขที่ ${n}: ค่าแรกต้องไม่มากกว่าค่าที่สอง`;
  return { source: c.source, codes, column: c.column, op: c.op, value: list.join(",") };
}

/** Create (isNew) or update an opportunity. The code cannot change after create. */
export async function saveOpportunity(input: z.input<typeof OpportunityInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = OpportunityInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const { isNew, code, category, groupName, label, description, sortOrder, isActive, price } = p.data;
  const icodes = [...new Set(p.data.icodes)];
  const conditions: Condition[] = [];
  for (const [i, c] of p.data.conditions.entries()) {
    const r = checkCondition(c, i + 1);
    if (typeof r === "string") return fail(r);
    conditions.push(r);
  }
  const params = [code, category, groupName, label, description, JSON.stringify(conditions), isActive, sortOrder, icodes, price];
  if (isNew) {
    const { rowCount } = await assistExecute(
      `INSERT INTO opportunities (code, category, group_name, label, description, conditions, is_active, sort_order, icodes, price)
       VALUES ($1, $2, nullif($3, ''), $4, nullif($5, ''), $6::jsonb, $7, $8, $9::text[], $10::numeric) ON CONFLICT (code) DO NOTHING`,
      params,
    );
    if (!rowCount) return fail("มีรหัสนี้อยู่แล้ว");
  } else {
    const { rowCount } = await assistExecute(
      `UPDATE opportunities SET category = $2, group_name = nullif($3, ''), label = $4, description = nullif($5, ''),
              conditions = $6::jsonb, is_active = $7, sort_order = $8, icodes = $9::text[], price = $10::numeric, updated_at = now()
       WHERE code = $1`,
      params,
    );
    if (!rowCount) return fail("ไม่พบรายการนี้");
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setOpportunityActive(code: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  await assistExecute("UPDATE opportunities SET is_active = $2, updated_at = now() WHERE code = $1", [code, Boolean(isActive)]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** module_opportunities rows go with it (FK cascade). */
export async function deleteOpportunity(code: string): Promise<ActionResult> {
  await requireAdmin();
  await assistExecute("DELETE FROM opportunities WHERE code = $1", [code]);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const RluInput = z.object({
  isNew: z.boolean(),
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_.]{1,49}$/, "รหัสต้องเป็นตัวพิมพ์ใหญ่ ตัวเลข _ หรือ . ขึ้นต้นด้วยตัวอักษร 2–50 ตัว"),
  label: z.string().trim().min(1, "ต้องมีชื่อแล็บ").max(100),
  description: z.string().trim().max(500),
  // trust boundary: bound as SQL params on HIS by /api/agent/rlu
  labCodes: z.array(z.string().trim().regex(/^[0-9]{1,9}$/, "รหัสแล็บต้องเป็นตัวเลข")).min(1, "ต้องมีรหัสแล็บอย่างน้อย 1 รหัส").max(20),
  message: z.string().trim().max(200),
  sortOrder: z.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
  // no conditions = the item never warns, the agent only shows its results
  conditions: z.array(ConditionSchema).max(20),
});

/** Create (isNew) or update an RLU item. The code cannot change after create. */
export async function saveRluItem(input: z.input<typeof RluInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = RluInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const { isNew, code, label, description, message, sortOrder, isActive } = p.data;
  const conditions: Condition[] = [];
  for (const [i, c] of p.data.conditions.entries()) {
    const r = checkCondition(c, i + 1);
    if (typeof r === "string") return fail(r);
    conditions.push(r);
  }
  const params = [code, label, description, [...new Set(p.data.labCodes)], JSON.stringify(conditions), message, isActive, sortOrder];
  if (isNew) {
    const { rowCount } = await assistExecute(
      `INSERT INTO rlu_items (code, label, description, lab_codes, conditions, message, is_active, sort_order)
       VALUES ($1, $2, nullif($3, ''), $4::text[], $5::jsonb, nullif($6, ''), $7, $8) ON CONFLICT (code) DO NOTHING`,
      params,
    );
    if (!rowCount) return fail("มีรหัสนี้อยู่แล้ว");
  } else {
    const { rowCount } = await assistExecute(
      `UPDATE rlu_items SET label = $2, description = nullif($3, ''), lab_codes = $4::text[], conditions = $5::jsonb,
              message = nullif($6, ''), is_active = $7, sort_order = $8, updated_at = now()
       WHERE code = $1`,
      params,
    );
    if (!rowCount) return fail("ไม่พบรายการนี้");
  }
  revalidatePath("/admin/rlu", "layout");
  return { ok: true };
}

export async function setRluActive(code: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  await assistExecute("UPDATE rlu_items SET is_active = $2, updated_at = now() WHERE code = $1", [code, Boolean(isActive)]);
  revalidatePath("/admin/rlu", "layout");
  return { ok: true };
}

export async function deleteRluItem(code: string): Promise<ActionResult> {
  await requireAdmin();
  await assistExecute("DELETE FROM rlu_items WHERE code = $1", [code]);
  revalidatePath("/admin/rlu", "layout");
  return { ok: true };
}

const ModuleOpportunitiesInput = z.object({
  moduleCode: z.string().min(1).max(50),
  enabled: z.boolean(),
  codes: z.array(z.string().min(1).max(50)).max(500),
});

export async function saveModuleOpportunities(input: z.input<typeof ModuleOpportunitiesInput>): Promise<ActionResult> {
  await requireAdmin();
  const p = ModuleOpportunitiesInput.safeParse(input);
  if (!p.success) return fail("ข้อมูลไม่ถูกต้อง");
  const { moduleCode, enabled, codes } = p.data;
  const found = await assistTransaction(async (db) => {
    const { rowCount } = await db.query("UPDATE modules SET opportunities_enabled = $2, updated_at = now() WHERE code = $1", [
      moduleCode,
      enabled,
    ]);
    if (!rowCount) return false;
    await db.query("DELETE FROM module_opportunities WHERE module_code = $1", [moduleCode]);
    if (codes.length) {
      // unknown codes are dropped by the join instead of failing the whole save
      await db.query(
        `INSERT INTO module_opportunities (module_code, opportunity_code)
         SELECT $1, code FROM opportunities WHERE code = ANY($2::text[])`,
        [moduleCode, codes],
      );
    }
    return true;
  });
  if (!found) return fail("ไม่พบ module นี้");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
