import { HBA1C_MAX_AGE_DAYS } from "@bkh/shared";

export type Tone = "green" | "red" | "none";

/** Whole days from a "YYYY-MM-DD" date to today (local). */
export function daysAgo(ymd: string): number {
  const today = new Date();
  const then = new Date(`${ymd}T00:00:00`);
  return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - then.getTime()) / 86_400_000);
}

/** The top bar light: by test recency only (green = last test within HBA1C_MAX_AGE_DAYS); none = never tested. */
export function lightOf(results: { date: string; value: string }[]): { tone: Tone; why: string } {
  const last = results[0];
  if (!last) return { tone: "none", why: "ยังไม่เคยตรวจ HbA1c" };
  const age = daysAgo(last.date);
  const why = `ตรวจล่าสุด ${age} วันก่อน (${last.value}%)`;
  return age <= HBA1C_MAX_AGE_DAYS
    ? { tone: "green", why: `${why} ไม่เกิน ${HBA1C_MAX_AGE_DAYS} วัน` }
    : { tone: "red", why: `${why} เกิน ${HBA1C_MAX_AGE_DAYS} วัน ควรตรวจใหม่` };
}

export const thaiDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
