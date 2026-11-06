import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, PageHeader } from "@/components/ui/ui";
import { listOpportunities, sourceOptions } from "@/lib/admin-data";
import { DeleteOpportunityButton } from "../../item-controls";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "แก้ไขโอกาสเพิ่มรายได้" };

export default function OpportunityPage({ params }: PageProps<"/admin/opportunities/[code]">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/opportunities/[code]">["params"] }) {
  await connection();
  const code = decodeURIComponent((await params).code);
  const all = await listOpportunities();
  const o = all.find((x) => x.code === code);
  if (!o) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/opportunities", label: "โอกาสเพิ่มรายได้" }}
        title={o.label}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{o.code}</span>
            <span>· แสดง {o.matches7d} ครั้งใน 7 วัน · ใช้ใน {o.modules} module</span>
            {!o.isActive && <Badge>ปิดอยู่</Badge>}
          </span>
        }
        actions={<DeleteOpportunityButton code={o.code} label={o.label} />}
      />
      <OpportunityForm initial={o} categories={[...new Set(all.map((x) => x.category))]} sources={sourceOptions()} />
    </>
  );
}
