import { CheckRequestSchema, type ApiError, type CheckResponse } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { isModuleAllowed, moduleOpportunities, recordCheck, touchMachine, withRuleSettings } from "@/lib/check-store";
import { evaluateOpportunities } from "@/lib/opportunities/engine";
import { resolveVisit } from "@/lib/resolve-visit";
import { runRules } from "@/lib/rules/engine";
import { getModule } from "@/lib/rules/modules";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/** Privacy: log only vn/module/status — never HN, names or CID. */
function logCheck(module: string, status: CheckResponse["status"] | "error", vn?: string) {
  console.info("[agent/check]", JSON.stringify({ vn: vn ?? null, module, status }));
}

export async function POST(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(400, { error: "invalid_json" });
  }

  const parsed = CheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, {
      error: "invalid_body",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  const codeModule = getModule(input.module);
  if (!codeModule) return error(400, { error: "unknown_module" });
  const [machineId, mod] = await Promise.all([touchMachine(input.machine), withRuleSettings(codeModule)]);
  // Settings from the admin page: machine/module switched off, or module not assigned to this machine.
  const allowed = await isModuleAllowed(machineId, codeModule.code);
  if (!allowed.ok) return error(403, { error: allowed.reason });

  try {
    const resolution = await resolveVisit(input);

    let res: CheckResponse;
    if (resolution.kind === "not_found") {
      res = { status: "not_found", vn: input.vn, hn: input.hn, results: [], opportunities: [] };
    } else if (resolution.kind === "ambiguous") {
      res = { status: "ambiguous", hn: input.hn, results: [], candidates: resolution.candidates, opportunities: [] };
    } else {
      const { vn, hn } = resolution.visit;
      const results = await runRules(mod, vn);
      // add-on hints (e.g. PP); never change the status and never fail the check
      const opportunities = await evaluateOpportunities(await moduleOpportunities(mod.code), vn);
      res = { status: results.every((r) => r.passed) ? "ok" : "missing", vn, hn, results, opportunities };
    }

    logCheck(mod.code, res.status, res.vn);
    await recordCheck({ machineId, machineName: input.machine, moduleCode: mod.code, savedAt: input.savedAt, res });
    return Response.json(res);
  } catch (err) {
    // mysql2 errors carry a code (ECONNREFUSED, ER_...); log that, not the full error/params.
    const cause = err instanceof Error ? (err.cause ?? err) : err;
    const code = (cause as { code?: string } | null)?.code ?? (err instanceof Error ? err.message : "unknown");
    console.error("[agent/check] HIS error", JSON.stringify({ vn: input.vn ?? null, module: mod.code, code }));
    logCheck(mod.code, "error", input.vn);
    return error(502, { error: "his_unavailable" });
  }
}
