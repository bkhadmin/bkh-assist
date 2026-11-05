import type { ReactNode } from "react";
import { Icon } from "@/components/app-shell/icons";

// Centered brand + card for pages outside the (app) group (no AppShell): /login, /super/login.
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
            <Icon name="pulse" className="size-5" />
          </span>
          <span className="text-base font-semibold tracking-tight">BKH Assist</span>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 max-sm:p-5">
          <h1 className="mb-5 text-title">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

const tones = {
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
  success: "border-success-line bg-success-soft text-success",
};

// One-line message above the form. danger/warning are announced as alerts, success as status.
export function AuthNotice({ tone, id, children }: { tone: keyof typeof tones; id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role={tone === "success" ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {tone !== "success" && <Icon name="alert" className="mt-px size-4 shrink-0" />}
      {children}
    </p>
  );
}
