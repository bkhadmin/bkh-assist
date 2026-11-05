"use client";

import { useEffect, useId, useLayoutEffect, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons";
import { THEME_KEY, type ThemePref } from "./ui-prefs";

const listeners = new Set<() => void>();
let prefMemo: ThemePref | null = null; // wins once set, so switching still works when storage is blocked

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPref(): ThemePref {
  if (prefMemo) return prefMemo;
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function setPref(pref: ThemePref) {
  prefMemo = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {}
  applyTheme(pref);
  listeners.forEach((l) => l());
}

const options: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: "light", label: "สว่าง", icon: "sun" },
  { value: "dark", label: "มืด", icon: "moon" },
  { value: "system", label: "ตามระบบ", icon: "monitor" },
];

// Light / dark / system as a native radio group: arrow keys move between options.
export function ThemeSwitch() {
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as const);
  const name = useId();

  // Dev Strict Mode remount strips attributes the head script set on <html>; put the theme back before paint.
  useLayoutEffect(() => applyTheme(getPref()), []);

  // Follow OS changes while on "system".
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(getPref());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <fieldset className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-background p-0.5">
      <legend className="sr-only">ธีมสี</legend>
      {options.map((o) => (
        <label
          key={o.value}
          title={o.label}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:text-foreground has-checked:bg-surface has-checked:text-accent-text has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={pref === o.value}
            onChange={() => setPref(o.value)}
            className="sr-only"
          />
          <Icon name={o.icon} className="size-4" />
          <span className="sr-only">{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
