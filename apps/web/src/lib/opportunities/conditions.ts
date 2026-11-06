import { z } from "zod";

/**
 * Opportunity conditions: pure logic (no DB), shared by the engine, the admin actions and the admin form.
 * All conditions of an opportunity must match (AND). For OR, create two opportunities.
 */

export const OPS = {
  eq: "เท่ากับ",
  ne: "ไม่เท่ากับ",
  gt: "มากกว่า",
  gte: "มากกว่าหรือเท่ากับ",
  lt: "น้อยกว่า",
  lte: "น้อยกว่าหรือเท่ากับ",
  between: "อยู่ระหว่าง (ก, ข)",
  in: "เป็นหนึ่งใน (ก, ข, …)",
  not_in: "ไม่เป็นหนึ่งใน (ก, ข, …)",
  empty: "ว่าง / ไม่เคย",
  not_empty: "มีค่า / เคย",
  gt_or_empty: "ไม่เคย หรือ มากกว่า",
} as const;
export type Op = keyof typeof OPS;
export const NO_VALUE_OPS: readonly Op[] = ["empty", "not_empty"];

export const ConditionSchema = z.object({
  source: z.string().min(1).max(50),
  /** codes for sources with a param (PP codes, vaccine codes, …); omitted otherwise */
  codes: z.array(z.string().min(1).max(20)).max(100).optional(),
  column: z.string().min(1).max(50),
  op: z.enum(Object.keys(OPS) as [Op, ...Op[]]),
  value: z.string().max(200).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export type Cell = string | number | null | undefined;

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const isEmpty = (v: Cell) => v === null || v === undefined || v === "";

/** Does one column value satisfy the condition? Numbers compare numerically, everything else as text. */
export function matches(cond: Pick<Condition, "op" | "value">, cell: Cell, numeric: boolean): boolean {
  const { op, value } = cond;
  if (op === "empty") return isEmpty(cell);
  if (op === "not_empty") return !isEmpty(cell);
  if (isEmpty(cell)) return op === "gt_or_empty";

  if (op === "in" || op === "not_in") {
    const hit = list(value).some((x) => (numeric ? Number(x) === Number(cell) : x === String(cell)));
    return op === "in" ? hit : !hit;
  }
  if (op === "between") {
    const [lo, hi] = list(value).map(Number);
    const n = Number(cell);
    return Number.isFinite(lo) && Number.isFinite(hi) && n >= lo && n <= hi;
  }
  if (!numeric && (op === "eq" || op === "ne")) return (String(cell) === (value ?? "").trim()) === (op === "eq");

  const a = Number(cell);
  const b = Number(value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (op) {
    case "eq": return a === b;
    case "ne": return a !== b;
    case "gt":
    case "gt_or_empty": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
  }
  return false;
}

/** Human-readable summary, e.g. "อายุ (ปี) อยู่ระหว่าง 30, 59". */
export function describe(cond: Condition, columnLabel: string): string {
  const codes = cond.codes?.length ? ` [${cond.codes.join(", ")}]` : "";
  const value = NO_VALUE_OPS.includes(cond.op) ? "" : ` ${cond.value ?? ""}`;
  return `${columnLabel}${codes} ${OPS[cond.op]}${value}`;
}
