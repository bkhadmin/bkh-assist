"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { btnPrimary } from "@/components/ui/ui";
import { registerModule, setModuleActive } from "../actions";

export function ModuleActiveSwitch({ code, label, isActive }: { code: string; label: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(isActive);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-sm text-danger">บันทึกไม่สำเร็จ</span>}
      <Switch
        checked={value}
        disabled={pending}
        label={`${value ? "ปิด" : "เปิด"} module ${label}`}
        onChange={(v) =>
          start(async () => {
            setValue(v);
            setError(false);
            const r = await setModuleActive(code, v).catch(() => ({ ok: false as const }));
            if (!r.ok) setError(true);
          })
        }
      />
    </span>
  );
}

export function RegisterModuleButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={btnPrimary} disabled={pending} onClick={() => start(async () => void (await registerModule(code)))}>
      {pending ? "กำลังลงทะเบียน…" : "ลงทะเบียน"}
    </button>
  );
}
