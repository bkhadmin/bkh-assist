import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, btnPrimary, focusRing } from "@/components/ui/ui";
import { columnLabel, listRluItems } from "@/lib/admin-data";
import { describe } from "@/lib/opportunities/conditions";
import { RluActiveSwitch } from "../item-controls";

export const metadata: Metadata = { title: "RLU (แล็บ)" };

export default function RluPage() {
  return (
    <>
      <PageHeader
        title="RLU (แล็บ)"
        description="Rational Lab Use: แล็บที่แสดงในป้าย RLU ของ agent พร้อมผล 3 ครั้งล่าสุด ป้ายจะกะพริบเมื่อ visit ล่าสุดของผู้ป่วยเข้าเงื่อนไขของรายการใด"
        actions={
          <Link href="/admin/rlu/new" className={btnPrimary}>
            เพิ่มรายการ
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <RluList />
      </Suspense>
    </>
  );
}

async function RluList() {
  await connection();
  const rows = await listRluItems();
  return (
    <Card>
      {rows.length === 0 ? (
        <Empty>ยังไม่มีรายการ</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.code} className={`flex items-start gap-4 px-4 py-3 ${r.isActive ? "" : "bg-surface-sunken/60 text-muted"}`}>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/rlu/${encodeURIComponent(r.code)}`}
                  className={`rounded font-semibold text-foreground hover:text-accent-text hover:underline ${focusRing}`}
                >
                  {r.label}
                </Link>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-muted">
                  {r.code} · แล็บ {r.labCodes.join(", ")}
                  {!r.isActive && <Badge>ปิดอยู่</Badge>}
                </div>
                {r.message && <p className="mt-1 text-sm">{r.message}</p>}
                <ul className="mt-1 space-y-0.5 text-sm text-muted">
                  {r.conditions.length === 0 && <li>ไม่มีเงื่อนไข: ไม่เตือน แสดงเฉพาะผลแล็บ</li>}
                  {r.conditions.map((c, i) => (
                    <li key={i}>
                      {i > 0 && "และ "}
                      {describe(c, columnLabel(c))}
                    </li>
                  ))}
                </ul>
              </div>
              <RluActiveSwitch code={r.code} label={r.label} isActive={r.isActive} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
