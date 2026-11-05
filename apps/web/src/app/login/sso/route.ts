import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { plkhealthEnabled, signIn } from "@/auth";
import { safePath } from "@/lib/safe-path";

// Starts the Provider ID sign-in. A route handler, because signIn must set the state/PKCE/nonce cookies before it
// redirects to the IdP. proxy.ts sends /login here when there is nothing to show (no error, not just logged out).
export async function GET(request: NextRequest) {
  if (!plkhealthEnabled) return new Response(null, { status: 404 });
  try {
    await signIn("plkhealth", { redirectTo: safePath(request.nextUrl.searchParams.get("callbackUrl")) });
  } catch (e) {
    if (!(e instanceof AuthError)) throw e; // success throws NEXT_REDIRECT, which must propagate
    // With ?error=, /login shows the message and a retry button instead of sending the user back here (no loop).
    redirect(`/login?error=${encodeURIComponent(e.type)}`);
  }
}
