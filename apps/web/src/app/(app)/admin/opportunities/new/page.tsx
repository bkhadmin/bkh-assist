import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/ui";
import { listOpportunities, sourceOptions } from "@/lib/admin-data";
import { OpportunityForm } from "../opportunity-form";

export const metadata: Metadata = { title: "เพิ่มโอกาสเพิ่มรายได้" };

export default function NewOpportunityPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/opportunities", label: "โอกาสเพิ่มรายได้" }} title="เพิ่มรายการ" />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <NewForm />
      </Suspense>
    </>
  );
}

async function NewForm() {
  await connection();
  const categories = [...new Set((await listOpportunities()).map((o) => o.category))];
  return <OpportunityForm initial={null} categories={categories} sources={sourceOptions()} />;
}
