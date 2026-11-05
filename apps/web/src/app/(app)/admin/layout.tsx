import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";

// Every page under /admin is admin-only. proxy.ts already redirects non-admins; this is the second check.
// It reads the session cookie, so it sits inside <Suspense> (cacheComponents).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminOnly>{children}</AdminOnly>
    </Suspense>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/");
  return children;
}
