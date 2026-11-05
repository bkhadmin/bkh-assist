import { Suspense } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { UserMenu } from "@/components/app-shell/user-menu";

// Every signed-in page lives in this group; /login sits outside it, so it renders without the shell.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      account={
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
