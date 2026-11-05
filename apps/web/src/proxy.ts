import { NextResponse } from "next/server";
import { auth, plkhealthEnabled } from "@/auth";

// /admin and /api/admin, whole path segments only (/administrator is not admin).
const ADMIN_PATH = /^\/(api\/)?admin(\/|$)/;

// Route protection for the whole app (Next 16 proxy, Auth.js `auth` wrapper). Every route the matcher
// lets through needs a session: pages redirect to /login, /api/* gets 401 JSON. Everything under /admin and
// /api/admin also needs role "admin" (from the JWT, no DB read): pages redirect to /, /api/admin/* gets 403.
// The admin layout and each admin route handler check again; the proxy is not the only gate.
export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  // Only reached without ?error= / ?logged_out= (see matcher): go straight to SSO, keeping callbackUrl.
  // With either param /login renders its message and a retry button, so a failed or just-ended sign-in cannot loop.
  if (pathname === "/login") {
    return plkhealthEnabled ? NextResponse.redirect(new URL(`/login/sso${search}`, req.nextUrl)) : undefined;
  }
  const isApi = pathname.startsWith("/api/");
  if (req.auth) {
    if (!ADMIN_PATH.test(pathname) || req.auth.user.role === "admin") return;
    if (isApi) return Response.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  if (isApi) return Response.json({ error: "unauthorized" }, { status: 401 });

  // callbackUrl is a path on this origin only; the login action re-checks it before redirecting.
  const login = new URL("/login", req.nextUrl);
  login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  // Public: the login pages (/login, /login/sso which starts SSO, /super/login for the super user), the SSO redirect_uri
  // (/auth/callback, forwards to Auth.js), Auth.js endpoints, the Windows agent's endpoints (/api/agent/*, which
  // authenticate with the agent key, and /api/health), build assets and static files. New routes are protected
  // by default. The second entry sends a bare /login (no error, not logged out) through the proxy for auto-SSO.
  matcher: [
    "/((?!login$|login/sso$|super/login$|auth/callback$|api/auth/|api/agent/|api/health$|_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    {
      source: "/login",
      missing: [
        { type: "query", key: "error" },
        { type: "query", key: "logged_out" },
      ],
    },
  ],
};
