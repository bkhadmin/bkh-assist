import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, Empty, Notice, PageHeader, focusRing } from "@/components/ui/ui";
import { getModuleDetail } from "@/lib/admin-data";
import { ModuleForm } from "./module-form";
import { RulesTable } from "./rules-table";

export const metadata: Metadata = { title: "ตั้งค่า module" };

export default function ModuleDetailPage({ params }: PageProps<"/admin/modules/[code]">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/modules/[code]">["params"] }) {
  await connection();
  const { code } = await params;
  const m = await getModuleDetail(decodeURIComponent(code));
  if (!m) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/modules", label: "Module ทั้งหมด" }}
        title={m.label}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{m.code}</span>
            {m.hosxpForm && <span className="font-mono">· {m.hosxpForm}</span>}
            {!m.isActive && <Badge>ปิดอยู่</Badge>}
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-5 max-xl:grid-cols-1">
        <Card title="กฎที่ตรวจเมื่อกดบันทึก" aside={<span className="text-sm text-muted">ไม่ครบ = จำนวนครั้งใน 7 วัน</span>}>
          {!m.hasCode ? (
            <div className="p-4">
              <Notice tone="danger">ยังไม่มีกฎของ module นี้ในโค้ด ต้องให้ผู้พัฒนาเพิ่มก่อน (SQL ทุกกฎต้องผ่าน prove-query)</Notice>
            </div>
          ) : m.rules.length === 0 ? (
            <Empty>ไม่มีกฎ</Empty>
          ) : (
            <RulesTable moduleCode={m.code} rules={m.rules} />
          )}
          <p className="border-t border-line px-4 py-3 text-sm text-muted">
            เงื่อนไขของกฎ (SQL) แก้ได้ในโค้ดเท่านั้น และต้องพิสูจน์กับฐาน HIS ก่อนใช้ หน้านี้ปรับได้เฉพาะการเปิด/ปิด ระดับ และลำดับ
          </p>
        </Card>

        <div className="space-y-5">
          <Card title="ข้อมูล module">
            <ModuleForm code={m.code} label={m.label} description={m.description ?? ""} />
          </Card>
          <Card title={`เครื่องที่ใช้ module นี้ (${m.machineList.length})`}>
            {m.machineList.length === 0 ? (
              <Empty>
                ยังไม่มีเครื่อง ·{" "}
                <Link href="/admin/machines" className={`rounded text-accent-text hover:underline ${focusRing}`}>
                  กำหนดที่หน้าเครื่อง
                </Link>
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {m.machineList.map((x) => (
                  <li key={x.id} className="px-4 py-2.5">
                    <div className="font-medium">{x.displayName ?? x.name}</div>
                    {x.displayName && <div className="font-mono text-sm text-muted">{x.name}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
