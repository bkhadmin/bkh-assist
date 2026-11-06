"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { btn } from "@/components/ui/ui";
import { deleteOpportunity, deleteRluItem, setOpportunityActive, setRluActive, type ActionResult } from "./actions";

/** Active switch and delete button of an admin list item (opportunities, RLU). */

function ActiveSwitch({ label, isActive, save }: { label: string; isActive: boolean; save: (v: boolean) => Promise<ActionResult> }) {
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
            const r = await save(v).catch(() => ({ ok: false as const }));
            if (!r.ok) setError(true);
          })
        }
      />
    </span>
  );
}

function DeleteButton({ confirmText, remove, backHref }: { confirmText: string; remove: () => Promise<ActionResult>; backHref: string }) {
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
          if (!confirm(confirmText)) return;
          start(async () => {
            setError(false);
            const r = await remove().catch(() => null);
            if (r?.ok) router.push(backHref);
            else setError(true);
          });
        }}
      >
        {pending ? "กำลังลบ…" : "ลบรายการ"}
      </button>
    </>
  );
}

type Item = { code: string; label: string };

export const OpportunityActiveSwitch = ({ code, label, isActive }: Item & { isActive: boolean }) => (
  <ActiveSwitch label={label} isActive={isActive} save={(v) => setOpportunityActive(code, v)} />
);

export const DeleteOpportunityButton = ({ code, label }: Item) => (
  <DeleteButton
    confirmText={`ลบ "${label}"? module ที่เลือกรายการนี้ไว้จะไม่ตรวจอีก และย้อนกลับไม่ได้`}
    remove={() => deleteOpportunity(code)}
    backHref="/admin/opportunities"
  />
);

export const RluActiveSwitch = ({ code, label, isActive }: Item & { isActive: boolean }) => (
  <ActiveSwitch label={label} isActive={isActive} save={(v) => setRluActive(code, v)} />
);

export const DeleteRluButton = ({ code, label }: Item) => (
  <DeleteButton confirmText={`ลบ "${label}"? agent จะไม่แสดงแล็บนี้อีก และย้อนกลับไม่ได้`} remove={() => deleteRluItem(code)} backHref="/admin/rlu" />
);
