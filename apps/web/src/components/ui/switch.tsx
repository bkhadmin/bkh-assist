"use client";

import { focusRing } from "./ui";

/** Accessible on/off switch (role="switch"). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-wait disabled:opacity-60 ${
        checked ? "border-transparent bg-accent" : "border-line bg-surface-sunken"
      } ${focusRing}`}
    >
      <span
        className={`inline-block size-3.5 rounded-full shadow-sm transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-[18px] bg-accent-fg" : "translate-x-[2px] bg-muted"
        }`}
      />
    </button>
  );
}
