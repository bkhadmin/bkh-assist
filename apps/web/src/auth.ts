import { createHash, timingSafeEqual } from "node:crypto";
import NextAuth, { customFetch, type DefaultSession } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { assistQuery } from "@/lib/assist";

// userId = users.id (absent for the super user), role = users.role ("admin" for the super user).
declare module "next-auth" {
  interface User {
    userId?: string;
    role?: string;
  }
  interface Session {
    user: { userId?: string; role?: string } & DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
  }
}

// Hash first so both sides are 32 bytes: timingSafeEqual needs equal lengths and must not leak the real length.
const sha256 = (s: string) => createHash("sha256").update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

const providers: Provider[] = [];

// Super user from .env, signs in at /super/login. Off unless both vars are set, so an empty password can never match.
const { AUTH_ADMIN_USER: adminUser, AUTH_ADMIN_PASSWORD: adminPassword } = process.env;
export const superUserEnabled = Boolean(adminUser && adminPassword);
if (adminUser && adminPassword) {
  providers.push(
    Credentials({
      credentials: { username: {}, password: {} },
      authorize({ username, password }) {
        // Compare both fields every time, so the response time does not tell which one was wrong.
        const userOk = safeEqual(String(username ?? ""), adminUser);
        const passOk = safeEqual(String(password ?? ""), adminPassword);
        return userOk && passOk ? { id: "admin", name: adminUser, role: "admin" } : null;
      },
    }),
  );
}

// SSO: PLK Health ID (OIDC). The IdP only accepts its registered {origin}/auth/callback, not the Auth.js default
// /api/auth/callback/plkhealth, so AUTH_PLKHEALTH_REDIRECT_URI replaces redirect_uri in both requests that carry it
// (they must match), and src/app/auth/callback/route.ts hands the response on to Auth.js.
// /login starts this sign-in by itself (proxy.ts -> /login/sso). More IdPs plug in the same way: push one provider and
// set its env.
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const {
  AUTH_PLKHEALTH_ISSUER: plkIssuer,
  AUTH_PLKHEALTH_ID: plkId,
  AUTH_PLKHEALTH_SECRET: plkSecret,
  AUTH_PLKHEALTH_REDIRECT_URI: plkRedirectUri,
} = process.env;
export const plkhealthEnabled = Boolean(plkIssuer && plkId && plkSecret && plkRedirectUri);
if (plkhealthEnabled) {
  providers.push({
    id: "plkhealth",
    name: "Provider ID",
    type: "oidc",
    issuer: plkIssuer,
    clientId: plkId,
    clientSecret: plkSecret,
    // Authorize request: params override Auth.js's redirect_uri (@auth/core lib/actions/signin/authorization-url.js).
    authorization: { params: { scope: "openid profile email organization", redirect_uri: plkRedirectUri } },
    // Token request: Auth.js always sends provider.callbackUrl (lib/actions/callback/oauth/callback.js), so swap it here.
    [customFetch]: (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (init?.body instanceof URLSearchParams && init.body.get("grant_type") === "authorization_code") {
        init.body.set("redirect_uri", plkRedirectUri!);
      }
      return fetch(input, init);
    },
    checks: ["pkce", "state", "nonce"], // the IdP requires nonce with the openid scope
    idToken: false, // the id_token is still verified; the claims come from userinfo, which the IdP documents
    profile(p) {
      const name = `${str(p.prename) ?? ""}${str(p.fname) ?? ""} ${str(p.lname) ?? ""}`.trim();
      return { id: p.sub, name: name || p.sub };
    },
  });
}

// Params: [sub, prename, fname, lname, all claims as a JSON string]; absent claims are null. profile is replaced on every
// sign-in and stays in the DB only (email can hold a ThaiD citizen ID), never in the JWT or session.
// job_position and organizations mirror the profile, so they are overwritten on every sign-in too.
const UPSERT_USER = `
INSERT INTO users (provider_id, pname, fname, lname, profile, job_position, organizations)
VALUES ($1, $2, coalesce($3, ''), coalesce($4, ''), $5::jsonb, $6, $7::jsonb)
ON CONFLICT (provider_id) DO UPDATE
  SET pname = coalesce($2, users.pname),
      fname = coalesce($3, users.fname),
      lname = coalesce($4, users.lname),
      profile = $5::jsonb,
      job_position = $6,
      organizations = $7::jsonb
RETURNING id, role, permission, is_approve`;

// users.organizations: [{ org_code, org_name, job_position }], never null. Several orgs come in profile.organizations[];
// today the IdP sends one org as flat claims (org_code, org_name, job_position).
type Claims = Record<string, unknown> | null | undefined;
const org = (o: Claims) => ({ org_code: str(o?.org_code), org_name: str(o?.org_name), job_position: str(o?.job_position) });
function organizations(p: Claims) {
  if (Array.isArray(p?.organizations)) return p.organizations.map((o) => org(o as Claims));
  return p?.org_code || p?.org_name ? [org(p)] : [];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // No DB adapter yet: the session is an encrypted JWT cookie (AUTH_SECRET). 3 days, sliding: proxy.ts re-issues the
  // cookie on every request, so it expires after 3 idle days. jwt.maxAge defaults to this value.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 3 },
  // Auth.js errors land on /login?error=<type>.
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "plkhealth") return true;
      const sub = str(profile?.sub);
      if (!sub) return false;
      const [row] = await assistQuery<{ id: string; role: string; is_approve: boolean }>(UPSERT_USER, [
        sub,
        str(profile?.prename),
        str(profile?.fname),
        str(profile?.lname),
        // JSON as strings: pg would turn an array into a PG array literal
        JSON.stringify(profile ?? {}),
        str(profile?.job_position),
        JSON.stringify(organizations(profile)),
      ]);
      // Unapproved: the row stays so an admin can approve it.
      if (!row.is_approve) return "/login?error=pending";
      // ponytail: without a DB adapter jwt() receives this same user object; with an adapter, look the row up in jwt().
      user.userId = row.id;
      user.role = row.role;
      return true;
    },
    // ponytail: role and approval are read at sign-in only, so a change applies at the next sign-in.
    jwt({ token, user }) {
      if (user) {
        token.userId = user.userId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.userId = token.userId;
      session.user.role = token.role;
      return session;
    },
  },
});
