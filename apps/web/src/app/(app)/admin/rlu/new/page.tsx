import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/ui";
import { sourceOptions } from "@/lib/admin-data";
import { RluForm } from "../rlu-form";

export const metadata: Metadata = { title: "เพิ่มรายการ RLU" };

export default function NewRluPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/rlu", label: "RLU (แล็บ)" }} title="เพิ่มรายการ" />
      <RluForm initial={null} sources={sourceOptions()} />
    </>
  );
}
