import Link from "next/link";
import type { ReactNode } from "react";

// Small building blocks shared by bkh_assist pages; same tokens and sizes as the bkh-insight shell.

export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface";
export const btn = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-foreground shadow-xs hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
export const btnPrimary = `inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg shadow-xs hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70 ${focusRing}`;
export const field = "h-8 w-full rounded-md border border-line bg-surface px-2.5 text-base text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PageHeader({ title, description, back, actions }: { title: string; description?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className={`mb-1.5 inline-flex items-center gap-1 rounded text-sm text-muted hover:text-foreground ${focusRing}`}>
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="text-title">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-title">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  neutral: "border-line bg-surface-sunken text-muted",
  accent: "border-accent-line bg-accent-soft text-accent-text",
  danger: "border-danger-line bg-danger-soft text-danger",
  warning: "border-warning-line bg-warning-soft text-warning",
  success: "border-success-line bg-success-soft text-success",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 text-xs leading-[18px] font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone, children }: { tone: Exclude<Tone, "neutral" | "accent">; children: ReactNode }) {
  return <p role={tone === "success" ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-muted">{children}</p>;
}

/** "5 นาทีที่แล้ว" from seconds elapsed; null -> "ยังไม่เคย". */
export function ago(secondsAgo: number | null): string {
  if (secondsAgo == null) return "ยังไม่เคย";
  const s = Math.max(0, secondsAgo);
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}
