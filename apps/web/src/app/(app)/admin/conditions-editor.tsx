"use client";

import type { Dispatch, SetStateAction } from "react";
import { btn, field, focusRing } from "@/components/ui/ui";
import type { SourceOption } from "@/lib/admin-data";
import { NO_VALUE_OPS, OPS, type Condition, type Op } from "@/lib/opportunities/conditions";

/** Conditions editor shared by the opportunity and RLU forms. The server re-validates every condition (checkCondition). */

export type ConditionRow = { id: number; source: string; codes: string; column: string; op: Op; value: string };

let nextId = 0;
export const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const placeholders: Partial<Record<Op, string>> = { between: "เช่น 30, 59", in: "เช่น 9, 18, 30", not_in: "เช่น 9, 18, 30" };

export const toRows = (conditions: Condition[]): ConditionRow[] =>
  conditions.map((c) => ({ id: nextId++, source: c.source, codes: (c.codes ?? []).join(", "), column: c.column, op: c.op, value: c.value ?? "" }));

export const toConditions = (rows: ConditionRow[], sources: SourceOption[]): Condition[] =>
  rows.map((r) => ({
    source: r.source,
    codes: sources.find((s) => s.code === r.source)?.param ? splitList(r.codes) : undefined,
    column: r.column,
    op: r.op,
    value: NO_VALUE_OPS.includes(r.op) ? undefined : r.value,
  }));

export function ConditionsEditor({
  sources,
  rows,
  setRows,
  emptyText,
}: {
  sources: SourceOption[];
  rows: ConditionRow[];
  setRows: Dispatch<SetStateAction<ConditionRow[]>>;
  emptyText: string;
}) {
  const sourceOf = (code: string) => sources.find((s) => s.code === code);
  const newRow = (source = sources[0]): ConditionRow => ({ id: nextId++, source: source.code, codes: "", column: source.columns[0].name, op: "eq", value: "" });
  const patch = (id: number, p: Partial<ConditionRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const n = [...rs];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  const iconBtn = `grid size-7 place-items-center rounded text-muted hover:bg-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent ${focusRing}`;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-title">เงื่อนไข</h2>
        <p className="mt-0.5 text-sm text-muted">
          ต้องตรงทุกข้อ (และ) จึงจะแจ้ง ถ้าต้องการ &quot;หรือ&quot; ให้สร้างอีกรายการ ระบบตรวจตามลำดับและหยุดที่ข้อแรกที่ไม่ตรง
          จึงควรวางเงื่อนไขผู้ป่วยที่ตรวจเร็ว (อายุ เพศ) ไว้ก่อนเงื่อนไขประวัติ
        </p>
      </div>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => {
          const src = sourceOf(r.source);
          const col = src?.columns.find((c) => c.name === r.column);
          const pattern = src?.param && new RegExp(src.param.pattern);
          const badCodes = pattern ? splitList(r.codes).filter((c) => !pattern.test(c)) : [];
          const n = i + 1;
          return (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-1.5 w-5 shrink-0 text-right text-sm font-semibold text-muted tabular-nums">{n}</span>
              <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2">
                <div className="space-y-1">
                  <select
                    aria-label={`แหล่งข้อมูลของเงื่อนไขที่ ${n}`}
                    value={r.source}
                    onChange={(e) => {
                      const s = sourceOf(e.target.value)!;
                      patch(r.id, { source: s.code, codes: "", column: s.columns[0].name });
                    }}
                    className={field}
                  >
                    {!src && <option value={r.source}>{r.source} (ไม่มีในโค้ดแล้ว)</option>}
                    {sources.map((s) => (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ))}
                  </select>
                  {src && <p className="text-xs text-muted">{src.description}</p>}
                </div>
                {src?.param && (
                  <div className="space-y-1">
                    <input
                      aria-label={`${src.param.label} ของเงื่อนไขที่ ${n}`}
                      value={r.codes}
                      onChange={(e) => patch(r.id, { codes: e.target.value })}
                      placeholder={src.param.label}
                      required
                      aria-invalid={badCodes.length > 0}
                      className={`${field} font-mono`}
                    />
                    <p className={`text-xs ${badCodes.length ? "text-danger" : "text-muted"}`}>
                      {badCodes.length ? `รหัสไม่ถูกต้อง: ${badCodes.join(", ")}` : src.param.hint}
                    </p>
                  </div>
                )}
                <select aria-label={`คอลัมน์ของเงื่อนไขที่ ${n}`} value={r.column} onChange={(e) => patch(r.id, { column: e.target.value })} className={field}>
                  {!col && <option value={r.column}>{r.column} (ไม่มีในโค้ดแล้ว)</option>}
                  {src?.columns.map((c) => (
                    <option key={c.name} value={c.name}>{c.label}</option>
                  ))}
                </select>
                <select aria-label={`เงื่อนไขที่ ${n}`} value={r.op} onChange={(e) => patch(r.id, { op: e.target.value as Op })} className={field}>
                  {(Object.keys(OPS) as Op[]).map((op) => (
                    <option key={op} value={op}>{OPS[op]}</option>
                  ))}
                </select>
                {!NO_VALUE_OPS.includes(r.op) && (
                  <input
                    aria-label={`ค่าของเงื่อนไขที่ ${n}`}
                    value={r.value}
                    onChange={(e) => patch(r.id, { value: e.target.value })}
                    required
                    maxLength={200}
                    placeholder={placeholders[r.op] ?? (col?.type === "number" ? "ตัวเลข" : "ค่า")}
                    inputMode={col?.type === "number" ? "decimal" : undefined}
                    className={field}
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center">
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`เลื่อนเงื่อนไขที่ ${n} ขึ้น`}>↑</button>
                <button type="button" className={iconBtn} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`เลื่อนเงื่อนไขที่ ${n} ลง`}>↓</button>
                <button type="button" className={`${iconBtn} hover:text-danger`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`ลบเงื่อนไขที่ ${n}`}>✕</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className={`px-4 py-3 ${rows.length ? "border-t border-line" : ""}`}>
        {rows.length === 0 && <p className="mb-2 text-sm text-muted">{emptyText}</p>}
        <button type="button" className={btn} onClick={() => setRows((rs) => [...rs, newRow()])}>
          + เพิ่มเงื่อนไข
        </button>
      </div>
    </section>
  );
}
