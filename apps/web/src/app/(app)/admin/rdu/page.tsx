import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge, Card, PageHeader } from "@/components/ui/ui";
import { assistQuery } from "@/lib/assist";
import { RDU_RULES } from "@/lib/rdu/rules";
import { RduRuleSwitch } from "./rule-switch";

export const metadata: Metadata = { title: "RDU (ยา)" };

export default function RduPage() {
  return (
    <>
      <PageHeader
        title="RDU (ยา)"
        description="Rational Drug Use: ตัวชี้วัด Service Plan สาขา RDU ราย visit agent เตือนเมื่อ visit ล่าสุดของผู้ป่วย (รวมยาที่กำลังสั่งแต่ยังไม่บันทึก) เข้าเกณฑ์ เงื่อนไขของกฎเขียนไว้ในโค้ด ที่นี่เปิด/ปิดได้อย่างเดียว"
      />
      <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
        <RduList />
      </Suspense>
    </>
  );
}

async function RduList() {
  await connection();
  const off = new Set(
    (await assistQuery<{ rule_code: string }>("SELECT rule_code FROM rdu_settings WHERE NOT is_active")).map((r) => r.rule_code),
  );
  return (
    <Card>
      <ul className="divide-y divide-line">
        {RDU_RULES.map((r) => {
          const isActive = !off.has(r.code);
          return (
            <li key={r.code} className={`flex items-start gap-4 px-4 py-3 ${isActive ? "" : "bg-surface-sunken/60 text-muted"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{r.label}</p>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm text-muted">
                  {r.code}
                  {!isActive && <Badge>ปิดอยู่</Badge>}
                </div>
                <p className="mt-1 text-sm">{r.criteria}</p>
                <details className="mt-1 text-sm text-muted">
                  <summary className="cursor-pointer">SQL</summary>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-surface-sunken p-2 font-mono text-xs">{r.sql.trim()}</pre>
                </details>
              </div>
              <RduRuleSwitch code={r.code} label={r.label} isActive={isActive} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
