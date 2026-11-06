"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { btn } from "@/components/ui/ui";
import { deleteOpportunity, setOpportunityActive } from "../actions";

export function OpportunityActiveSwitch({ code, label, isActive }: { code: string; label: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(isActive);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-sm text-danger">บันทึกไม่สำเร็จ</span>}
      <Switch
        checked={value}
        disabled={pending}
        label={`${value ? "ปิด" : "เปิด"} ${label}`}
        onChange={(v) =>
          start(async () => {
            setValue(v);
            setError(false);
            const r = await setOpportunityActive(code, v).catch(() => ({ ok: false as const }));
            if (!r.ok) setError(true);
          })
        }
      />
    </span>
  );
}

export function DeleteOpportunityButton({ code, label }: { code: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <>
      {error && <span className="text-sm text-danger">ลบไม่สำเร็จ</span>}
      <button
        type="button"
        className={`${btn} text-danger`}
        disabled={pending}
        onClick={() => {
          if (!confirm(`ลบ "${label}"? module ที่เลือกรายการนี้ไว้จะไม่ตรวจอีก และย้อนกลับไม่ได้`)) return;
          start(async () => {
            setError(false);
            const r = await deleteOpportunity(code).catch(() => null);
            if (r?.ok) router.push("/admin/opportunities");
            else setError(true);
          });
        }}
      >
        {pending ? "กำลังลบ…" : "ลบรายการ"}
      </button>
    </>
  );
}
