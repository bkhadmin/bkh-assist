/**
 * Asks the server to check a save. HOSxP writes the data a few seconds AFTER the click
 * (a confirm dialog comes first), so we poll while the server answers "not_found".
 * If the user cancels the save, nothing is ever written and we give up quietly.
 */
import { AGENT_KEY_HEADER, CheckResponseSchema, type CheckRequest, type CheckResponse } from "@bkh/shared";
import type { AgentConfig } from "./config";

export type CheckOutcome =
  | { kind: "result"; response: CheckResponse }
  | { kind: "gave_up" } // never written (cancelled save) or not found in time
  | { kind: "cancelled" } // superseded by a newer save
  | { kind: "error"; message: string };

export class Checker {
  private current: AbortController | null = null;

  constructor(private cfg: AgentConfig) {}

  /** Start checking a save; a newer save cancels the previous one. */
  async check(input: { hn: string | null; savedAt: Date }): Promise<CheckOutcome> {
    this.current?.abort();
    const ctrl = new AbortController();
    this.current = ctrl;

    const body: CheckRequest = {
      machine: this.cfg.machine,
      module: this.cfg.module,
      savedAt: input.savedAt.toISOString(),
      ...(input.hn ? { hn: input.hn } : {}),
    };
    const deadline = input.savedAt.getTime() + this.cfg.pollTimeoutMs;
    let lastError = "";

    while (Date.now() < deadline) {
      await sleep(this.cfg.pollMs, ctrl.signal);
      if (ctrl.signal.aborted) return { kind: "cancelled" };
      try {
        const res = await fetch(`${this.cfg.serverUrl}/api/agent/check`, {
          method: "POST",
          headers: { "content-type": "application/json", [AGENT_KEY_HEADER]: this.cfg.agentKey },
          body: JSON.stringify(body),
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(5000)]),
        });
        if (res.status === 401) return { kind: "error", message: "server ปฏิเสธ agent key" };
        if (!res.ok) {
          lastError = `server ตอบ ${res.status}`;
          continue;
        }
        const parsed = CheckResponseSchema.safeParse(await res.json());
        if (!parsed.success) return { kind: "error", message: "server ตอบรูปแบบไม่ถูกต้อง" };
        if (parsed.data.status !== "not_found") return { kind: "result", response: parsed.data };
        lastError = "";
      } catch (err) {
        if (ctrl.signal.aborted) return { kind: "cancelled" };
        lastError = "เชื่อมต่อ server ไม่ได้";
        console.error("[checker]", (err as Error).message);
      }
    }
    return lastError ? { kind: "error", message: lastError } : { kind: "gave_up" };
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cfg.serverUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}
