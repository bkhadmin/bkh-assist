/** Whole days from a "YYYY-MM-DD" date to today (local). */
export function daysAgo(ymd: string): number {
  const today = new Date();
  const then = new Date(`${ymd}T00:00:00`);
  return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - then.getTime()) / 86_400_000);
}

export const thaiDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
