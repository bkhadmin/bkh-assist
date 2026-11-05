// Only same-site paths ("/x", not "//host" or "/\host"), so a callbackUrl cannot become an open redirect.
export const safePath = (v: unknown): string => (typeof v === "string" && /^\/(?![/\\])/.test(v) ? v : "/");
