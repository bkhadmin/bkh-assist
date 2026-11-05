import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, focusRing } from "@/components/ui/ui";
import { listModules, unregisteredCodeModules } from "@/lib/admin-data";
import { ModuleActiveSwitch, RegisterModuleButton } from "./module-controls";

export const metadata: Metadata = { title: "Module และกฎ" };

export default function ModulesPage() {
  return (
    <>
      <PageHeader
        title="Module และกฎ"
        description="แต่ละ module คือหน้าจอหนึ่งใน HOSxP กับกฎที่ตรวจเมื่อกดบันทึก เปิด/ปิด module ได้ที่นี่ และกำหนดว่าเครื่องไหนใช้ module ไหนได้ที่หน้าเครื่อง"
      />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <ModuleList />
      </Suspense>
    </>
  );
}

async function ModuleList() {
  await connection();
  const [modules, unregistered] = await Promise.all([listModules(), unregisteredCodeModules()]);
  return (
    <div className="space-y-5">
      {unregistered.length > 0 && (
        <Card title="Module ใหม่ในโค้ดที่ยังไม่ได้ลงทะเบียน">
          <ul className="divide-y divide-line">
            {unregistered.map((m) => (
              <li key={m.code} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium">{m.label}</div>
                  <div className="font-mono text-sm text-muted">{m.code} · {m.rules.length} กฎ</div>
                </div>
                <RegisterModuleButton code={m.code} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {modules.length === 0 ? (
          <Empty>ยังไม่มี module</Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-3 py-2.5 font-medium max-md:hidden">หน้าจอ HOSxP</th>
                <th className="px-3 py-2.5 text-right font-medium">กฎที่เปิด</th>
                <th className="px-3 py-2.5 text-right font-medium max-sm:hidden">เครื่อง</th>
                <th className="px-3 py-2.5 text-right font-medium max-lg:hidden">ไม่ครบ (7 วัน)</th>
                <th className="px-4 py-2.5 text-right font-medium">เปิดใช้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {modules.map((m) => (
                <tr key={m.code} className={m.isActive ? "" : "text-muted"}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/modules/${encodeURIComponent(m.code)}`} className={`rounded font-semibold text-foreground hover:text-accent-text hover:underline ${focusRing}`}>
                      {m.label}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-muted">
                      {m.code}
                      {!m.hasCode && <Badge tone="danger">ไม่มีกฎในโค้ด</Badge>}
                      {!m.isActive && <Badge>ปิดอยู่</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-sm text-muted max-md:hidden">{m.hosxpForm ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {m.rulesActive}
                    <span className="text-muted"> / {m.rulesTotal}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums max-sm:hidden">{m.machines}</td>
                  <td className="px-3 py-3 text-right tabular-nums max-lg:hidden">
                    {m.checks7d ? (
                      <>
                        {m.missing7d}
                        <span className="text-muted"> / {m.checks7d} ({Math.round((m.missing7d / m.checks7d) * 100)}%)</span>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ModuleActiveSwitch code={m.code} label={m.label} isActive={m.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
