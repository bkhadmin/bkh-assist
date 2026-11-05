// The redirect_uri registered at PLK Health ID (fixed by the IdP, so not the Auth.js default).
// Hand the IdP response, query string unchanged, to Auth.js. A relative Location keeps the browser on the origin
// it came in on (localhost or behind a reverse proxy), and the same-origin hop carries the state/PKCE/nonce cookies.
export function GET(request: Request) {
  const { search } = new URL(request.url);
  return new Response(null, { status: 307, headers: { Location: `/api/auth/callback/plkhealth${search}` } });
}
