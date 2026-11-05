import { connection } from "next/server";
import { auth, signOut } from "@/auth";
import { ProfileMenu } from "./profile-menu";

// Server component: reads the session cookie, so it must sit inside <Suspense> (cacheComponents).
export async function UserMenu() {
  // auth() draws random bytes (crypto.getRandomValues) before it touches the cookie; under cacheComponents that
  // counts as an unstable value during prerender. Mark this as request-time first.
  await connection();
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
