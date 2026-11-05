"use client";

import { useActionState, useId } from "react";
import { Notice, btnPrimary, field } from "@/components/ui/ui";
import { saveModule, type ActionResult } from "../../actions";

export function ModuleForm({ code, label, description }: { code: string; label: string; description: string }) {
  const ids = { label: useId(), description: useId() };
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, form) => saveModule({ code, label: String(form.get("label") ?? ""), description: String(form.get("description") ?? "") }),
    null,
  );
  return (
    <form action={action} className="space-y-3 p-4">
      <div className="space-y-1">
        <label htmlFor={ids.label} className="block text-sm font-medium">
          ชื่อที่แสดง
        </label>
        <input id={ids.label} name="label" defaultValue={label} required maxLength={100} className={field} />
        <p className="text-sm text-muted">แสดงในการ์ดแจ้งเตือนของ agent</p>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.description} className="block text-sm font-medium">
          คำอธิบาย
        </label>
        <textarea
          id={ids.description}
          name="description"
          defaultValue={description}
          maxLength={500}
          rows={3}
          className={`${field} h-auto py-1.5`}
        />
      </div>
      {state && (state.ok ? <Notice tone="success">บันทึกแล้ว</Notice> : <Notice tone="danger">{state.error}</Notice>)}
      <button type="submit" className={btnPrimary} disabled={pending}>
        {pending ? "กำลังบันทึก…" : "บันทึก"}
      </button>
    </form>
  );
}
