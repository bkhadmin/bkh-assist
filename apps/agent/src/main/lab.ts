/** Lab lookups for the top bar (through the server; the agent never talks to HIS directly). */
import { AGENT_KEY_HEADER, HbA1cResponseSchema, type HbA1cResponse } from "@bkh/shared";
import type { AgentConfig } from "./config";

/** Last 3 HbA1c results of a patient, newest first; null when the server cannot answer. */
export async function fetchHbA1c(cfg: AgentConfig, hn: string): Promise<HbA1cResponse["results"] | null> {
  try {
    const url = `${cfg.serverUrl}/api/agent/hba1c?hn=${encodeURIComponent(hn)}&machine=${encodeURIComponent(cfg.machine)}`;
    const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: cfg.agentKey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const parsed = HbA1cResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.results : null;
  } catch {
    return null;
  }
}
