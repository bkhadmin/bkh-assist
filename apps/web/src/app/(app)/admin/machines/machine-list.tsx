"use client";

import { useId, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge, Notice, ago, btn, btnPrimary, field, focusRing } from "@/components/ui/ui";
import type { MachineRow } from "@/lib/admin-data";
import { saveMachine } from "../actions";

type ModuleOption = { code: string; label: string; isActive: boolean };

/** An agent counts as online if it reported within this window (same as the overview page). */
const ONLINE_SECONDS = 15 * 60;

export function MachineList({ machines, modules }: { machines: MachineRow[]; modules: ModuleOption[] }) {
  const [editing, setEditing] = useState<number | null>(null);
  const labelOf = new Map(modules.map((m) => [m.code, m.label]));
  return (
    <ul className="divide-y divide-line">
      {machines.map((m) => {
        const online = m.seenSecondsAgo != null && m.seenSecondsAgo < ONLINE_SECONDS;
        return (
          <li key={m.id} className={m.isActive ? "" : "bg-surface-sunken/60"}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className={`size-2 shrink-0 rounded-full ${online ? "bg-accent" : "bg-line"}`} title={online ? "ออนไลน์" : "ออฟไลน์"} aria-hidden />
              <div className="min-w-48 flex-1">
                <div className="font-semibold">
                  {m.displayName ?? m.name}
                  {!m.isActive && <span className="ml-2 align-middle"><Badge>ปิดใช้งาน</Badge></span>}
                </div>
                <div className="text-sm text-muted">
                  {[
                    m.displayName && <span key="n" className="font-mono">{m.name}</span>,
                    m.department,
                    online ? "ออนไลน์" : `ติดต่อล่าสุด ${ago(m.seenSecondsAgo)}`,
                  ]
                    .filter(Boolean)
                    .map((part, i) => (
                      <span key={i}>
                        {i > 0 && " · "}
                        {part}
                      </span>
                    ))}
                </div>
              </div>
              <div className="flex min-w-40 flex-wrap gap-1.5">
                {m.modules.length ? (
                  m.modules.map((c) => (
                    <Badge key={c} tone="accent">
                      {labelOf.get(c) ?? c}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="warning">ยังไม่ได้เลือก module</Badge>
                )}
              </div>
              <div className="w-24 text-right text-sm text-muted tabular-nums max-md:text-left">ตรวจวันนี้ {m.checksToday}</div>
              <button type="button" className={btn} aria-expanded={editing === m.id} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                {editing === m.id ? "ปิด" : "แก้ไข"}
              </button>
            </div>
            {editing === m.id && <MachineEditor machine={m} modules={modules} onDone={() => setEditing(null)} />}
          </li>
        );
      })}
    </ul>
  );
}

function MachineEditor({ machine, modules, onDone }: { machine: MachineRow; modules: ModuleOption[]; onDone: () => void }) {
  const ids = { name: useId(), dept: useId() };
  const [displayName, setDisplayName] = useState(machine.displayName ?? "");
  const [department, setDepartment] = useState(machine.department ?? "");
  const [isActive, setIsActive] = useState(machine.isActive);
  const [selected, setSelected] = useState(new Set(machine.modules));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveMachine({ id: machine.id, displayName, department, isActive, modules: [...selected] }).catch(() => null);
      if (r?.ok) onDone();
      else setError(r && !r.ok ? r.error : "บันทึกไม่สำเร็จ");
    });
  }

  return (
    <form onSubmit={submit} className="mx-4 mb-4 grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface-sunken p-4 max-md:grid-cols-1">
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={ids.name} className="block text-sm font-medium">ชื่อที่แสดง</label>
          <input id={ids.name} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} placeholder={machine.name} className={field} />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.dept} className="block text-sm font-medium">แผนก</label>
          <input id={ids.dept} value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} placeholder="เช่น OPD อายุรกรรม" className={field} />
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Switch checked={isActive} onChange={setIsActive} label="เปิดใช้งานเครื่องนี้" />
          เปิดใช้งานเครื่องนี้
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Module ที่เครื่องนี้ตรวจ</legend>
        {modules.map((mod) => (
          <label key={mod.code} className={`flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2 ${focusRing} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}>
            <input type="checkbox" checked={selected.has(mod.code)} onChange={() => toggle(mod.code)} className="size-4 accent-[var(--accent)]" />
            <span className="flex-1">
              <span className="font-medium">{mod.label}</span> <span className="font-mono text-sm text-muted">{mod.code}</span>
            </span>
            {!mod.isActive && <Badge>module ปิดอยู่</Badge>}
          </label>
        ))}
      </fieldset>

      <div className="col-span-full flex items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button type="button" className={btn} onClick={onDone} disabled={pending}>ยกเลิก</button>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </form>
  );
}
