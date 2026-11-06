"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Notice, btn, btnPrimary, field, focusRing } from "@/components/ui/ui";
import type { OpportunityRow, SourceOption } from "@/lib/admin-data";
import { NO_VALUE_OPS, OPS, type Op } from "@/lib/opportunities/conditions";
import { saveOpportunity, type ActionResult } from "../actions";

type Row = { id: number; source: string; codes: string; column: string; op: Op; value: string };

let nextId = 0;
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const placeholders: Partial<Record<Op, string>> = { between: "เช่น 30, 59", in: "เช่น 9, 18, 30", not_in: "เช่น 9, 18, 30" };

/** Create (initial = null) or edit an opportunity. The server re-validates every condition. */
export function OpportunityForm({ initial, categories, sources }: { initial: OpportunityRow | null; categories: string[]; sources: SourceOption[] }) {
  const router = useRouter();
  const ids = { code: useId(), category: useId(), categories: useId(), group: useId(), label: useId(), description: useId(), sort: useId(), icodes: useId(), price: useId() };
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.conditions ?? []).map((c) => ({ id: nextId++, source: c.source, codes: (c.codes ?? []).join(", "), column: c.column, op: c.op, value: c.value ?? "" })),
  );
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const sourceOf = (code: string) => sources.find((s) => s.code === code);

  const newRow = (source = sources[0]): Row => ({ id: nextId++, source: source.code, codes: "", column: source.columns[0].name, op: "eq", value: "" });
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const n = [...rs];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

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
        icodes: split(text("icodes")),
        price: text("price"),
        isActive,
        conditions: rows.map((r) => ({
          source: r.source,
          codes: sourceOf(r.source)?.param ? split(r.codes) : undefined,
          column: r.column,
          op: r.op,
          value: NO_VALUE_OPS.includes(r.op) ? undefined : r.value,
        })),
      }).catch((): ActionResult => ({ ok: false, error: "บันทึกไม่สำเร็จ" }));
      if (res.ok && !initial) router.push("/admin/opportunities");
      else setState(res);
    });
  }

  const iconBtn = `grid size-7 place-items-center rounded text-muted hover:bg-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent ${focusRing}`;

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
        <div className="space-y-1">
          <label htmlFor={ids.icodes} className="block text-sm font-medium">icode ค่าบริการ (HOSxP)</label>
          <input id={ids.icodes} name="icodes" defaultValue={(initial?.icodes ?? []).join(", ")} placeholder="เช่น 3001142 คั่นด้วย , ถ้ามีหลายรายการ" className={field} />
          <p className="text-sm text-muted">ราคาจาก nondrugitems / drugitems รวมกัน แสดงที่ป้ายจัดเก็บของ agent · เว้นว่างได้</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.price} className="block text-sm font-medium">ราคาเหมาจ่าย (บาท)</label>
          <input
            id={ids.price}
            name="price"
            type="number"
            min={0}
            max={1_000_000}
            step={0.01}
            inputMode="decimal"
            defaultValue={initial?.price ?? ""}
            placeholder="เช่น 4000"
            className={field}
          />
          <p className="text-sm text-muted">ใช้แทนราคาจาก icode เช่น ค่าเบิกเหมาจ่าย สปสช. · เว้นว่างได้</p>
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
            const badCodes = pattern ? split(r.codes).filter((c) => !pattern.test(c)) : [];
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
          {rows.length === 0 && <p className="mb-2 text-sm text-muted">ยังไม่มีเงื่อนไข ต้องมีอย่างน้อย 1 ข้อ</p>}
          <button type="button" className={btn} onClick={() => setRows((rs) => [...rs, newRow()])}>
            + เพิ่มเงื่อนไข
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "กำลังบันทึก…" : initial ? "บันทึก" : "สร้างรายการ"}
        </button>
        {state && (state.ok ? <Notice tone="success">บันทึกแล้ว</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      </div>
    </form>
  );
}
