import { auth, signOut } from "@/auth";
import { ProfileMenu } from "./profile-menu";

// Server component: reads the session cookie, so it must sit inside <Suspense> (cacheComponents).
export async function UserMenu() {
  const session = await auth();
  if (!session?.user?.name) return null;

  return (
    <ProfileMenu
      name={session.user.name}
      admin={session.user.role === "admin"}
      signOut={async () => {
        "use server";
        // logged_out=1 stops /login from starting SSO again while the IdP session is still alive.
        await signOut({ redirectTo: "/login?logged_out=1" });
      }}
    />
  );
}
