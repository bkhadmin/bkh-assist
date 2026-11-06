import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, btnPrimary, focusRing } from "@/components/ui/ui";
import { columnLabel, groupOpportunities, listOpportunities } from "@/lib/admin-data";
import { describe } from "@/lib/opportunities/conditions";
import { OpportunityActiveSwitch } from "../item-controls";

export const metadata: Metadata = { title: "โอกาสเพิ่มรายได้" };

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        title="โอกาสเพิ่มรายได้"
        description="ข้อความแนะนำบริการที่เบิกได้ (เช่น PP) แสดงให้เจ้าหน้าที่เมื่อ visit เข้าเงื่อนไข ไม่นับเป็นข้อมูลไม่ครบ เลือกว่า module ไหนตรวจรายการใดได้ที่หน้า module"
        actions={
          <Link href="/admin/opportunities/new" className={btnPrimary}>
            เพิ่มรายการ
          </Link>
        }
      />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <OpportunityList />
      </Suspense>
    </>
  );
}

async function OpportunityList() {
  await connection();
  const rows = await listOpportunities();
  if (rows.length === 0)
    return (
      <Card>
        <Empty>ยังไม่มีรายการ</Empty>
      </Card>
    );
  return (
    <div className="space-y-5">
      {groupOpportunities(rows).map((cat) => (
        <Card key={cat.category} title={cat.category} aside={<span className="text-sm text-muted">แสดง = จำนวนครั้งใน 7 วัน</span>}>
          {cat.groups.map((g) => (
            <div key={g.name ?? ""}>
              {g.name && <h3 className="border-b border-line bg-surface-sunken px-4 py-2 text-sm font-semibold text-muted">{g.name}</h3>}
              <ul className="divide-y divide-line">
                {g.items.map((o) => (
                  <li key={o.code} className={`flex items-start gap-4 px-4 py-3 ${o.isActive ? "" : "bg-surface-sunken/60 text-muted"}`}>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/opportunities/${encodeURIComponent(o.code)}`}
                        className={`rounded font-semibold text-foreground hover:text-accent-text hover:underline ${focusRing}`}
                      >
                        {o.label}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-muted">
                        {o.code}
                        {o.price != null && <span title="ราคาเหมาจ่าย">฿{o.price.toLocaleString("th-TH")}</span>}
                        {!o.isActive && <Badge>ปิดอยู่</Badge>}
                        {o.modules > 0 && <Badge tone="accent">ใช้ใน {o.modules} module</Badge>}
                      </div>
                      <ul className="mt-1 space-y-0.5 text-sm text-muted">
                        {o.conditions.map((c, i) => (
                          <li key={i}>
                            {i > 0 && "และ "}
                            {describe(c, columnLabel(c))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="w-16 text-right text-sm tabular-nums" title="จำนวนครั้งที่แสดงใน 7 วัน">
                      {o.matches7d || <span className="text-muted">0</span>}
                    </div>
                    <OpportunityActiveSwitch code={o.code} label={o.label} isActive={o.isActive} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
