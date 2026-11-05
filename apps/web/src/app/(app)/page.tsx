import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, Empty, PageHeader } from "@/components/ui/ui";
import { getOverview } from "@/lib/admin-data";

export const metadata: Metadata = { title: "ภาพรวม" };

export default function HomePage() {
  return (
    <>
      <PageHeader title="ภาพรวมวันนี้" description="ผลการตรวจความครบถ้วนของการบันทึกใน HOSxP จาก agent ทุกเครื่อง" />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  await connection();
  const o = await getOverview();
  const pct = o.checksToday ? Math.round((o.missingToday / o.checksToday) * 100) : 0;
  const max = Math.max(1, ...o.topMissing.map((t) => t.n));
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <Kpi label="ตรวจวันนี้" value={o.checksToday} unit="ครั้ง" />
        <Kpi label="บันทึกไม่ครบ" value={o.missingToday} unit={o.checksToday ? `ครั้ง · ${pct}%` : "ครั้ง"} tone={o.missingToday ? "danger" : undefined} />
        <Kpi label="รายการค้างยังไม่แก้" value={o.openIssues} unit="visit" tone={o.openIssues ? "warning" : undefined} />
        <Kpi label="เครื่องออนไลน์" value={o.machinesOnline} unit={`/ ${o.machinesTotal} เครื่อง`} />
      </dl>

      <Card title="รายการที่ขาดบ่อยวันนี้" aside={<Link href="/admin/modules" className="text-sm text-accent-text hover:underline">ตั้งค่ากฎ</Link>}>
        {o.topMissing.length === 0 ? (
          <Empty>ยังไม่มีรายการที่ขาดวันนี้</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {o.topMissing.map((t) => (
              <li key={t.label} className="grid grid-cols-[minmax(0,14rem)_1fr_3rem] items-center gap-3 px-4 py-2.5">
                <span className="truncate font-medium">{t.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                  <span className="block h-full rounded-full bg-danger/70" style={{ width: `${(t.n / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{t.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: number; unit: string; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`text-kpi font-semibold tabular-nums ${color}`}>{value.toLocaleString("th-TH")}</span>
        <span className="text-sm text-muted">{unit}</span>
      </dd>
    </div>
  );
}
