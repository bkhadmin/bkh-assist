"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge, Notice, btn, btnPrimary, focusRing } from "@/components/ui/ui";
import { saveModuleOpportunities, type ActionResult } from "../../actions";

type Item = { code: string; label: string; isActive: boolean };
type Groups = { category: string; groups: { name: string | null; items: Item[] }[] }[];

/** Add-on switch + which opportunities this module checks. Inactive ones are shown but cannot be ticked. */
export function ModuleOpportunities({ moduleCode, enabled: initialEnabled, selected: initialSelected, groups }: {
  moduleCode: string;
  enabled: boolean;
  selected: string[];
  groups: Groups;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const toggle = (codes: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const c of codes) if (on) n.add(c); else n.delete(c);
      return n;
    });

  function save() {
    setState(null);
    start(async () => {
      const r = await saveModuleOpportunities({ moduleCode, enabled, codes: [...selected] }).catch(
        (): ActionResult => ({ ok: false, error: "บันทึกไม่สำเร็จ" }),
      );
      setState(r);
    });
  }

  return (
    <div className="space-y-4 p-4">
      <label className="flex items-center gap-2.5 font-medium">
        <Switch checked={enabled} onChange={setEnabled} label="เปิดใช้ตัวเลือกเสริมโอกาสเพิ่มรายได้" />
        เปิดใช้ใน module นี้
      </label>
      <p className="text-sm text-muted">
        เป็นข้อความแนะนำเท่านั้น ไม่นับเป็นข้อมูลไม่ครบ agent แสดงรายการที่ visit เข้าเงื่อนไขต่อจากผลการตรวจ
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">ยังไม่มีรายการโอกาสเพิ่มรายได้</p>
      ) : (
        <div className={`space-y-4 ${enabled ? "" : "opacity-60"}`}>
          {groups.map((cat) => (
            <fieldset key={cat.category} className="space-y-3">
              <legend className="text-sm font-semibold">{cat.category}</legend>
              {cat.groups.map((g) => {
                const active = g.items.filter((x) => x.isActive).map((x) => x.code);
                const all = active.length > 0 && active.every((c) => selected.has(c));
                return (
                  <div key={g.name ?? ""} className="rounded-lg border border-line">
                    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken px-3 py-1.5">
                      <span className="text-sm font-medium text-muted">{g.name ?? "ไม่มีกลุ่ม"}</span>
                      <button type="button" className={`${btn} h-7`} disabled={active.length === 0} onClick={() => toggle(active, !all)}>
                        {all ? "ไม่เลือกทั้งกลุ่ม" : "เลือกทั้งกลุ่ม"}
                      </button>
                    </div>
                    <ul className="grid grid-cols-2 gap-x-4 px-3 py-1.5 max-lg:grid-cols-1">
                      {g.items.map((o) => (
                        <li key={o.code}>
                          <label className={`flex items-start gap-2.5 rounded py-1 ${o.isActive ? "" : "text-muted"} ${focusRing} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}>
                            <input
                              type="checkbox"
                              checked={selected.has(o.code)}
                              disabled={!o.isActive}
                              onChange={(e) => toggle([o.code], e.target.checked)}
                              className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                            />
                            <span className="min-w-0">
                              {o.label} {!o.isActive && <Badge>ปิดอยู่</Badge>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <span className="text-sm text-muted">เลือกไว้ {selected.size} รายการ</span>
        {state && (state.ok ? <Notice tone="success">บันทึกแล้ว</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      </div>
    </div>
  );
}
