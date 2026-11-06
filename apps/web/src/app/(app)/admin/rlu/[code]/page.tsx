import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, PageHeader } from "@/components/ui/ui";
import { listRluItems, sourceOptions } from "@/lib/admin-data";
import { DeleteRluButton } from "../../item-controls";
import { RluForm } from "../rlu-form";

export const metadata: Metadata = { title: "แก้ไขรายการ RLU" };

export default function RluItemPage({ params }: PageProps<"/admin/rlu/[code]">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/rlu/[code]">["params"] }) {
  await connection();
  const code = decodeURIComponent((await params).code);
  const r = (await listRluItems()).find((x) => x.code === code);
  if (!r) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/rlu", label: "RLU (แล็บ)" }}
        title={r.label}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="font-mono">{r.code}</span>
            {!r.isActive && <Badge>ปิดอยู่</Badge>}
          </span>
        }
        actions={<DeleteRluButton code={r.code} label={r.label} />}
      />
      <RluForm initial={r} sources={sourceOptions()} />
    </>
  );
}
