/**
 * Agent configuration. First file found wins:
 *   1. %ProgramData%\bkh_assist\agent.json   (installed machines)
 *   2. <app dir>\agent.config.json            (development; gitignored)
 * Environment variables override file values: BKH_SERVER_URL, BKH_AGENT_KEY, BKH_MODULE, BKH_MODULE_LABEL.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

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

const PROGRAM_DATA_FILE = join(process.env.ProgramData ?? "C:\\ProgramData", "bkh_assist", "agent.json");

/** "10.10.10.159:3020/" -> "http://10.10.10.159:3020"; null unless it is a plain http(s) server address. */
export function normalizeServerUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || u.search || u.hash) return null;
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Keep a new server address in the config file the agent loaded (the ProgramData one on installed machines), keeping
 * its other values. Writing ProgramData needs the elevated agent, which the installer's logon task gives.
 * BKH_SERVER_URL still wins on the next start (development only).
 */
export function saveServerUrl(source: string, serverUrl: string) {
  const file = source === "defaults" ? PROGRAM_DATA_FILE : source;
  const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) : {};
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...current, serverUrl }, null, 2) + "\n", "utf8");
}

export function loadConfig(appDir: string): { config: AgentConfig; source: string } {
  const candidates = [
    PROGRAM_DATA_FILE,
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
