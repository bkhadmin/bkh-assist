"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Notice, btnPrimary, field } from "@/components/ui/ui";
import type { OpportunityRow, SourceOption } from "@/lib/admin-data";
import { saveOpportunity, type ActionResult } from "../actions";
import { ConditionsEditor, splitList, toConditions, toRows } from "../conditions-editor";

/** Create (initial = null) or edit an opportunity. The server re-validates every condition. */
export function OpportunityForm({ initial, categories, sources }: { initial: OpportunityRow | null; categories: string[]; sources: SourceOption[] }) {
  const router = useRouter();
  const ids = { code: useId(), category: useId(), categories: useId(), group: useId(), label: useId(), description: useId(), sort: useId(), icodes: useId() };
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [rows, setRows] = useState(() => toRows(initial?.conditions ?? []));
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    const code = initial?.code ?? text("code");
    setState(null);
    start(async () => {
      const res = await saveOpportunity({
        isNew: !initial,
        code,
        category: text("category"),
        groupName: text("group_name"),
        label: text("label"),
        description: text("description"),
        sortOrder: Number(text("sort_order")),
        icodes: splitList(text("icodes")),
        isActive,
        conditions: toConditions(rows, sources),
      }).catch((): ActionResult => ({ ok: false, error: "บันทึกไม่สำเร็จ" }));
      if (res.ok && !initial) router.push("/admin/opportunities");
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
              placeholder="เช่น PP.CERVICAL"
              className={`${field} font-mono`}
            />
          )}
          <p className="text-sm text-muted">{initial ? "แก้รหัสไม่ได้หลังสร้าง" : "ภาษาอังกฤษตัวพิมพ์ใหญ่ แก้ไม่ได้หลังสร้าง"}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.category} className="block text-sm font-medium">หมวด</label>
          <input id={ids.category} name="category" list={ids.categories} required maxLength={50} defaultValue={initial?.category ?? "PP"} className={field} />
          <datalist id={ids.categories}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.group} className="block text-sm font-medium">กลุ่ม</label>
          <input id={ids.group} name="group_name" maxLength={100} defaultValue={initial?.groupName ?? ""} placeholder="เช่น ผู้สูงอายุ 60 ปีขึ้นไป" className={field} />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.sort} className="block text-sm font-medium">ลำดับ</label>
          <input id={ids.sort} name="sort_order" type="number" required min={0} step={1} defaultValue={initial?.sortOrder ?? 0} className={field} />
          <p className="text-sm text-muted">น้อยขึ้นก่อน ทั้งในรายการนี้และในการ์ดแจ้งเตือน</p>
        </div>
        <div className="col-span-full space-y-1">
          <label htmlFor={ids.icodes} className="block text-sm font-medium">icode ค่าบริการ (HOSxP)</label>
          <input id={ids.icodes} name="icodes" defaultValue={(initial?.icodes ?? []).join(", ")} placeholder="เช่น 3001142 คั่นด้วย , ถ้ามีหลายรายการ" className={field} />
          <p className="text-sm text-muted">ราคาจาก nondrugitems / drugitems รวมกัน แสดงที่ป้ายจัดเก็บของ agent · เว้นว่างได้</p>
        </div>
        <div className="col-span-full space-y-1">
          <label htmlFor={ids.label} className="block text-sm font-medium">ข้อความแจ้งหน้างาน</label>
          <input id={ids.label} name="label" required maxLength={200} defaultValue={initial?.label ?? ""} className={field} />
          <p className="text-sm text-muted">ข้อความที่เจ้าหน้าที่เห็นในการ์ดของ agent</p>
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

      <ConditionsEditor sources={sources} rows={rows} setRows={setRows} emptyText="ยังไม่มีเงื่อนไข ต้องมีอย่างน้อย 1 ข้อ" />

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "กำลังบันทึก…" : initial ? "บันทึก" : "สร้างรายการ"}
        </button>
        {state && (state.ok ? <Notice tone="success">บันทึกแล้ว</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      </div>
    </form>
  );
}
