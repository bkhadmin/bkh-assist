"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setRduActive } from "../actions";

/** On/off switch of one RDU rule (same behaviour as the switches in ../item-controls.tsx). */
export function RduRuleSwitch({ code, label, isActive }: { code: string; label: string; isActive: boolean }) {
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
            const r = await setRduActive(code, v).catch(() => ({ ok: false as const }));
            if (!r.ok) setError(true);
          })
        }
      />
    </span>
  );
}
