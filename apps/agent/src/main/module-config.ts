/**
 * Which modules this machine checks, as set on the admin page (GET /api/agent/config).
 * A save is checked with the module whose hosxpForm matches the HOSxP screen it came from.
 *
 * Until the server has answered once (e.g. it is down at startup) the module from the local
 * config file is used, so a fresh install still works offline from the admin page.
 */
import { AGENT_KEY_HEADER, AgentConfigResponseSchema, type AgentModule } from "@bkh/shared";
import type { AgentConfig } from "./config";

export const REFRESH_MS = 5 * 60 * 1000;

export class ModuleConfig {
  private fromServer: { active: boolean; modules: AgentModule[] } | null = null;

  constructor(private cfg: AgentConfig) {}

  /** Fetch the latest assignment; keeps the previous one if the server cannot be reached. */
  async refresh(): Promise<boolean> {
    try {
      const url = `${this.cfg.serverUrl}/api/agent/config?machine=${encodeURIComponent(this.cfg.machine)}`;
      const res = await fetch(url, { headers: { [AGENT_KEY_HEADER]: this.cfg.agentKey }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return false;
      const parsed = AgentConfigResponseSchema.safeParse(await res.json());
      if (!parsed.success) return false;
      this.fromServer = { active: parsed.data.active, modules: parsed.data.modules };
      return true;
    } catch {
      return false;
    }
  }

  get source(): "server" | "local" {
    return this.fromServer ? "server" : "local";
  }

  /** Modules shown in the tray menu. */
  list(): AgentModule[] {
    if (!this.fromServer) return [{ code: this.cfg.module, label: this.cfg.moduleLabel, hosxpForm: null }];
    return this.fromServer.active ? this.fromServer.modules : [];
  }

  get machineActive(): boolean {
    return this.fromServer?.active ?? true;
  }

  /** Module for a save on this HOSxP form, or null when this machine does not check that screen. */
  pick(formClass: string): AgentModule | null {
    const modules = this.list();
    return modules.find((m) => m.hosxpForm === formClass) ?? modules.find((m) => m.hosxpForm == null) ?? null;
  }
}
