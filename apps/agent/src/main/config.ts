/**
 * Agent configuration. First file found wins:
 *   1. %ProgramData%\bkh_assist\agent.json   (installed machines)
 *   2. <app dir>\agent.config.json            (development; gitignored)
 * Environment variables override file values: BKH_SERVER_URL, BKH_AGENT_KEY, BKH_MODULE, BKH_MODULE_LABEL.
 */
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

export type AgentConfig = {
  serverUrl: string;
  agentKey: string;
  module: string;
  moduleLabel: string;
  machine: string;
  /** Poll the server every pollMs until HOSxP has written the save, at most pollTimeoutMs. */
  pollMs: number;
  pollTimeoutMs: number;
};

const DEFAULTS: AgentConfig = {
  serverUrl: "http://localhost:3000",
  agentKey: "",
  module: "OPDVisitcheck",
  moduleLabel: "ซักประวัติ OPD",
  machine: hostname(),
  pollMs: 2000,
  pollTimeoutMs: 30000,
};

export function loadConfig(appDir: string): { config: AgentConfig; source: string } {
  const candidates = [
    join(process.env.ProgramData ?? "C:\\ProgramData", "bkh_assist", "agent.json"),
    join(appDir, "agent.config.json"),
  ];
  let fileValues: Partial<AgentConfig> = {};
  let source = "defaults";
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    fileValues = JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
    source = p;
    break;
  }
  const env = process.env;
  const config: AgentConfig = {
    ...DEFAULTS,
    ...fileValues,
    ...(env.BKH_SERVER_URL && { serverUrl: env.BKH_SERVER_URL }),
    ...(env.BKH_AGENT_KEY && { agentKey: env.BKH_AGENT_KEY }),
    ...(env.BKH_MODULE && { module: env.BKH_MODULE }),
    ...(env.BKH_MODULE_LABEL && { moduleLabel: env.BKH_MODULE_LABEL }),
  };
  config.serverUrl = config.serverUrl.replace(/\/+$/, "");
  return { config, source };
}
