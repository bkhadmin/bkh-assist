import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { superUserEnabled } from "@/auth";
import { AuthCard } from "@/components/auth-card/auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบผู้ดูแลระบบ" };

// Super user (Credentials from AUTH_ADMIN_USER / AUTH_ADMIN_PASSWORD). Outside the (app) group, so no AppShell.
// Not linked from /login; 404 while the super user is turned off.
export default function SuperLoginPage() {
  if (!superUserEnabled) notFound();
  return (
    <AuthCard title="เข้าสู่ระบบผู้ดูแลระบบ">
      <LoginForm />
    </AuthCard>
  );
}
