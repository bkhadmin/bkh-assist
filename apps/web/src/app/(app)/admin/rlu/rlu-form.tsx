"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Notice, btnPrimary, field } from "@/components/ui/ui";
import type { RluRow, SourceOption } from "@/lib/admin-data";
import { saveRluItem, type ActionResult } from "../actions";
import { ConditionsEditor, splitList, toConditions, toRows } from "../conditions-editor";

/** Create (initial = null) or edit an RLU item. The server re-validates the lab codes and every condition. */
export function RluForm({ initial, sources }: { initial: RluRow | null; sources: SourceOption[] }) {
  const router = useRouter();
  const ids = { code: useId(), label: useId(), labCodes: useId(), sort: useId(), message: useId(), description: useId() };
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [rows, setRows] = useState(() => toRows(initial?.conditions ?? []));
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    setState(null);
    start(async () => {
      const res = await saveRluItem({
        isNew: !initial,
        code: initial?.code ?? text("code"),
        label: text("label"),
        description: text("description"),
        labCodes: splitList(text("lab_codes")),
        message: text("message"),
        sortOrder: Number(text("sort_order")),
        isActive,
        conditions: toConditions(rows, sources),
      }).catch((): ActionResult => ({ ok: false, error: "บันทึกไม่สำเร็จ" }));
      if (res.ok && !initial) router.push("/admin/rlu");
      else setState(res);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-4 max-md:grid-cols-1">
        <div className="space-y-1">
          <label htmlFor={ids.code} className="block text-sm font-medium">รหัส</label>
          {initial ? (
            <input id={ids.code} value={initial.code} readOnly disabled className={`${field} font-mono`} />
          ) : (
            <input
              id={ids.code}
              name="code"
              required
              pattern="[A-Z][A-Z0-9_.]{1,49}"
              title="ตัวพิมพ์ใหญ่ ตัวเลข _ หรือ . ขึ้นต้นด้วยตัวอักษร"
              placeholder="เช่น LDL"
              className={`${field} font-mono`}
            />
          )}
          <p className="text-sm text-muted">{initial ? "แก้รหัสไม่ได้หลังสร้าง" : "ภาษาอังกฤษตัวพิมพ์ใหญ่ แก้ไม่ได้หลังสร้าง"}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.label} className="block text-sm font-medium">ชื่อแล็บ</label>
          <input id={ids.label} name="label" required maxLength={100} defaultValue={initial?.label ?? ""} placeholder="เช่น HbA1c" className={field} />
          <p className="text-sm text-muted">ชื่อที่แสดงในป้าย RLU ของ agent</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.labCodes} className="block text-sm font-medium">รหัสแล็บ (lab_items_code)</label>
          <input
            id={ids.labCodes}
            name="lab_codes"
            required
            pattern="\s*\d{1,9}(\s*,\s*\d{1,9})*\s*"
            title="ตัวเลข คั่นด้วย ,"
            defaultValue={(initial?.labCodes ?? []).join(", ")}
            placeholder="เช่น 334 คั่นด้วย , ถ้ามีหลายรหัส"
            className={`${field} font-mono`}
          />
          <p className="text-sm text-muted">agent แสดงผล 3 ครั้งล่าสุดที่รายงานแล้วของรหัสเหล่านี้</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.sort} className="block text-sm font-medium">ลำดับ</label>
          <input id={ids.sort} name="sort_order" type="number" required min={0} step={1} defaultValue={initial?.sortOrder ?? 0} className={field} />
          <p className="text-sm text-muted">น้อยขึ้นก่อน ทั้งในรายการนี้และใน agent</p>
        </div>
        <div className="col-span-full space-y-1">
          <label htmlFor={ids.message} className="block text-sm font-medium">ข้อความเตือน</label>
          <input id={ids.message} name="message" maxLength={200} defaultValue={initial?.message ?? ""} placeholder="เช่น ไม่ได้ตรวจเกิน 90 วัน" className={field} />
          <p className="text-sm text-muted">แสดงเมื่อเข้าเงื่อนไข · เว้นว่างได้</p>
        </div>
        <div className="col-span-full space-y-1">
          <label htmlFor={ids.description} className="block text-sm font-medium">คำอธิบาย</label>
          <textarea id={ids.description} name="description" maxLength={500} rows={2} defaultValue={initial?.description ?? ""} className={`${field} h-auto py-1.5`} />
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Switch checked={isActive} onChange={setIsActive} label="เปิดใช้รายการนี้" />
          เปิดใช้รายการนี้
        </label>
      </section>

      <ConditionsEditor sources={sources} rows={rows} setRows={setRows} emptyText="ยังไม่มีเงื่อนไข: ไม่เตือน แสดงเฉพาะผลแล็บ" />

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "กำลังบันทึก…" : initial ? "บันทึก" : "สร้างรายการ"}
        </button>
        {state && (state.ok ? <Notice tone="success">บันทึกแล้ว</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      </div>
    </form>
  );
}
