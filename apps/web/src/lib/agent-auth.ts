import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { AGENT_KEY_HEADER } from "@bkh/shared";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

let warnedMissingKey = false;

/**
 * Shared-key check for agent endpoints (header `x-agent-key` vs AGENT_ENROLL_KEY).
 * Both sides are hashed first so timingSafeEqual gets equal-length buffers and the
 * comparison time does not depend on the key length.
 * TODO: per-machine tokens once /api/agent/register exists (needs the Assist DB).
 */
export function isAgentAuthorized(req: Request): boolean {
  const expected = process.env.AGENT_ENROLL_KEY;
  if (!expected) {
    if (!warnedMissingKey) {
      console.error("[agent-auth] AGENT_ENROLL_KEY is not set; rejecting all agent requests");
      warnedMissingKey = true;
    }
    return false;
  }
  const given = req.headers.get(AGENT_KEY_HEADER) ?? "";
  return timingSafeEqual(digest(given), digest(expected));
}
