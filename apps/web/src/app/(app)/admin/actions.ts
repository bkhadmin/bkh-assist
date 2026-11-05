"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assistExecute, assistQuery, assistTransaction } from "@/lib/assist";
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
