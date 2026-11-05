"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { focusRing } from "@/components/ui/ui";
import type { RuleRow } from "@/lib/admin-data";
import { saveRule, saveRuleOrder } from "../../actions";

/**
 * Rules of one module: switch on/off, choose severity, move up/down.
 * Changes save immediately; the row shows "บันทึกไม่สำเร็จ" and rolls back if the server refuses.
 */
export function RulesTable({ moduleCode, rules: initial }: { moduleCode: string; rules: RuleRow[] }) {
  const [rules, setRules] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update(code: string, patch: Partial<Pick<RuleRow, "isActive" | "severity">>) {
    const before = rules;
    const next = rules.map((r) => (r.code === code ? { ...r, ...patch } : r));
    const row = next.find((r) => r.code === code)!;
    setRules(next);
    setError(null);
    start(async () => {
      const res = await saveRule({ moduleCode, ruleCode: code, isActive: row.isActive, severity: row.severity }).catch(() => null);
      if (!res?.ok) {
        setRules(before);
        setError(res && !res.ok ? res.error : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const j = index + delta;
    if (j < 0 || j >= rules.length) return;
    const before = rules;
    const next = [...rules];
    [next[index], next[j]] = [next[j], next[index]];
    setRules(next);
    setError(null);
    start(async () => {
      const res = await saveRuleOrder(moduleCode, next.map((r) => r.code)).catch(() => null);
      if (!res?.ok) {
        setRules(before);
        setError("บันทึกลำดับไม่สำเร็จ");
      }
    });
  }

  const iconBtn = `grid size-6 place-items-center rounded text-muted hover:bg-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent ${focusRing}`;

  return (
    <div aria-busy={pending}>
      {error && (
        <p role="alert" className="border-b border-danger-line bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <table className="w-full text-left">
        <thead className="border-b border-line text-sm text-muted">
          <tr>
            <th className="w-14 px-2 py-2.5 font-medium">
              <span className="sr-only">ลำดับ</span>
            </th>
            <th className="px-2 py-2.5 font-medium">กฎ</th>
            <th className="px-3 py-2.5 font-medium">ระดับ</th>
            <th className="px-3 py-2.5 text-right font-medium max-sm:hidden">ไม่ครบ</th>
            <th className="px-4 py-2.5 text-right font-medium">เปิดใช้</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rules.map((r, i) => (
            <tr key={r.code} className={r.isActive ? "" : "bg-surface-sunken/60 text-muted"}>
              <td className="px-2 py-2.5">
                <div className="flex items-center">
                  <button type="button" className={iconBtn} disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`เลื่อน ${r.label} ขึ้น`}>
                    ↑
                  </button>
                  <button type="button" className={iconBtn} disabled={i === rules.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`เลื่อน ${r.label} ลง`}>
                    ↓
                  </button>
                </div>
              </td>
              <td className="px-2 py-2.5">
                <div className="font-semibold text-foreground">{r.label}</div>
                <details className="group">
                  <summary className={`w-fit list-none rounded font-mono text-sm text-muted hover:text-foreground ${focusRing}`}>
                    {r.code} <span className="text-xs group-open:hidden">· ดูเงื่อนไข</span>
                  </summary>
                  <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-surface-sunken p-2 font-mono text-xs whitespace-pre-wrap text-foreground">
                    {r.sql}
                  </pre>
                </details>
              </td>
              <td className="px-3 py-2.5">
                <select
                  aria-label={`ระดับของ ${r.label}`}
                  value={r.severity}
                  disabled={pending}
                  onChange={(e) => update(r.code, { severity: e.target.value as RuleRow["severity"] })}
                  className={`h-7 rounded-md border px-1.5 text-sm font-semibold ${
                    r.severity === "error" ? "border-danger-line bg-danger-soft text-danger" : "border-warning-line bg-warning-soft text-warning"
                  } ${focusRing}`}
                >
                  <option value="error">จำเป็น</option>
                  <option value="warning">ควรมี</option>
                </select>
                {r.severity !== r.defaultSeverity && <div className="mt-0.5 text-xs text-muted">ค่าเดิม: {r.defaultSeverity === "error" ? "จำเป็น" : "ควรมี"}</div>}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums max-sm:hidden">{r.fails7d || <span className="text-muted">0</span>}</td>
              <td className="px-4 py-2.5 text-right">
                <Switch checked={r.isActive} disabled={pending} label={`${r.isActive ? "ปิด" : "เปิด"}กฎ ${r.label}`} onChange={(v) => update(r.code, { isActive: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
