/** Lab lookups for the top bar (through the server; the agent never talks to HIS directly). */
import { AGENT_KEY_HEADER, AgentAuthenResponseSchema, AgentServicePointResponseSchema, type AgentServicePointResponse, AgentOpportunitiesResponseSchema, HbA1cResponseSchema, type AgentAuthenResponse, type AgentOpportunitiesResponse, type HbA1cResponse } from "@bkh/shared";
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

/** Opportunities (e.g. PP) of the patient's latest visit for this machine's modules; null when the server cannot answer. */
export async function fetchOpportunities(cfg: AgentConfig, hn: string): Promise<AgentOpportunitiesResponse["items"] | null> {
  try {
    const url = `${cfg.serverUrl}/api/agent/opportunities?hn=${encodeURIComponent(hn)}&machine=${encodeURIComponent(cfg.machine)}`;
    const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: cfg.agentKey }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const parsed = AgentOpportunitiesResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.items : null;
  } catch {
    return null;
  }
}

/** Authen Code status of the patient's latest visit; null when the server cannot answer. */
export async function fetchAuthen(cfg: AgentConfig, hn: string): Promise<Omit<AgentAuthenResponse, "hn"> | null> {
  try {
    const url = `${cfg.serverUrl}/api/agent/authen?hn=${encodeURIComponent(hn)}&machine=${encodeURIComponent(cfg.machine)}`;
    const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: cfg.agentKey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const parsed = AgentAuthenResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    const { hn: _hn, ...rest } = parsed.data;
    return rest;
  } catch {
    return null;
  }
}

/** The modules this machine may use and the one it uses; with `module`, first make that the machine's module. */
export async function servicePoint(cfg: AgentConfig, module?: string): Promise<AgentServicePointResponse | null> {
  try {
    const res = await fetch(`${cfg.serverUrl}/api/agent/service-point?machine=${encodeURIComponent(cfg.machine)}`, {
      method: module ? "POST" : "GET",
      headers: { [AGENT_KEY_HEADER]: cfg.agentKey, "content-type": "application/json" },
      body: module ? JSON.stringify({ machine: cfg.machine, module }) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const parsed = AgentServicePointResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
