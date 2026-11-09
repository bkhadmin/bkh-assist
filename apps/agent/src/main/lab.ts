/** Lab lookups for the top bar (through the server; the agent never talks to HIS directly). */
import { AGENT_KEY_HEADER, AgentAuthenResponseSchema, AgentServicePointResponseSchema, type AgentServicePointResponse, AgentOpportunitiesResponseSchema, AgentRluResponseSchema, AgentRduResponseSchema, type AgentRduResponse, type AgentAuthenResponse, type AgentOpportunitiesResponse, type AgentRluResponse } from "@bkh/shared";
import type { AgentConfig } from "./config";

/** RLU items of a patient (every active item, admin order, with its last 3 results); null when the server cannot answer. */
export async function fetchRlu(cfg: AgentConfig, hn: string): Promise<AgentRluResponse["items"] | null> {
  try {
    const url = `${cfg.serverUrl}/api/agent/rlu?hn=${encodeURIComponent(hn)}&machine=${encodeURIComponent(cfg.machine)}`;
    const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: cfg.agentKey }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const parsed = AgentRluResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.items : null;
  } catch {
    return null;
  }
}

/**
 * RDU rules the patient's latest visit hits; with `drug` (text of HOSxP's drug box, not saved yet) that drug takes
 * part too (its hits carry drugs[].pending). Only the hits; null when the server cannot answer.
 */
export async function fetchRdu(cfg: AgentConfig, hn: string, drug?: string): Promise<AgentRduResponse["hits"] | null> {
  try {
    const url = `${cfg.serverUrl}/api/agent/rdu?hn=${encodeURIComponent(hn)}&machine=${encodeURIComponent(cfg.machine)}${drug ? `&drug=${encodeURIComponent(drug)}` : ""}`;
    const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: cfg.agentKey }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const parsed = AgentRduResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.hits : null;
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
