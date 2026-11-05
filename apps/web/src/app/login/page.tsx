import type { Metadata } from "next";
import { plkhealthEnabled } from "@/auth";
import { AuthCard, AuthNotice } from "@/components/auth-card/auth-card";
import { SsoLogin } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

// Outside the (app) group, so it renders without AppShell. A bare /login never renders: proxy.ts sends it straight to
// SSO. This page shows only with ?error= or ?logged_out=1, as a message plus a manual retry button.
// The super user signs in at /super/login (not linked from here).
export default function LoginPage() {
  return (
    <AuthCard title="เข้าสู่ระบบ">
      {plkhealthEnabled ? <SsoLogin /> : <AuthNotice tone="warning">ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ</AuthNotice>}
    </AuthCard>
  );
}
