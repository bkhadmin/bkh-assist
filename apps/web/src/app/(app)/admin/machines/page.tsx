import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, Empty, PageHeader } from "@/components/ui/ui";
import { listMachines, moduleOptions } from "@/lib/admin-data";
import { MachineList } from "./machine-list";

export const metadata: Metadata = { title: "เครื่องที่ติดตั้ง agent" };

export default function MachinesPage() {
  return (
    <>
      <PageHeader
        title="เครื่องที่ติดตั้ง agent"
        description="เครื่องจะปรากฏที่นี่เองเมื่อเปิด agent ครั้งแรก ตั้งชื่อ แผนก และเลือก module ที่เครื่องนั้นตรวจ agent จะรับค่าใหม่ภายใน 5 นาที"
      />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <Machines />
      </Suspense>
    </>
  );
}

async function Machines() {
  await connection();
  const [machines, modules] = await Promise.all([listMachines(), moduleOptions()]);
  return (
    <Card>
      {machines.length === 0 ? (
        <Empty>ยังไม่มีเครื่อง ติดตั้งและเปิด agent แล้วเครื่องจะขึ้นที่นี่</Empty>
      ) : (
        <MachineList machines={machines} modules={modules.map((m) => ({ code: m.code, label: m.label, isActive: m.is_active, hosxpForm: m.hosxp_form }))} />
      )}
    </Card>
  );
}
