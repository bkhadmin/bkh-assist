import { AgentServicePointRequestSchema, type AgentServicePointResponse, type ApiError } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { assistQuery, assistTransaction } from "@/lib/assist";
import { machineConfig, touchMachine } from "@/lib/check-store";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/**
 * The agent's settings window ("ตั้งค่าจุดบริการ"): which module (service point) this machine checks.
 * Same data as the admin page's machine editor (machine_modules). The agent picks ONE module: modules on the
 * same HOSxP screen cannot run together (see saveMachine in admin/actions.ts).
 */
async function body(machineId: number, machine: string): Promise<AgentServicePointResponse> {
  const [modules, cfg] = await Promise.all([
    assistQuery<{ code: string; label: string; description: string | null }>(
      "SELECT code, label, description FROM modules WHERE is_active ORDER BY label",
    ),
    machineConfig(machineId),
  ]);
  return { machine, active: cfg.active, modules, selected: cfg.modules.map((m) => m.code) };
}

function machineParam(req: Request) {
  const machine = new URL(req.url).searchParams.get("machine")?.trim() ?? "";
  return machine && machine.length <= 100 ? machine : null;
}

/** GET /api/agent/service-point?machine=<hostname> — the active modules and the one(s) this machine uses. */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const machine = machineParam(req);
  if (!machine) return error(400, { error: "invalid_machine" });
  const machineId = await touchMachine(machine);
  if (machineId == null) return error(503, { error: "assist_unavailable" });
  try {
    return Response.json(await body(machineId, machine));
  } catch {
    return error(503, { error: "assist_unavailable" });
  }
}

/** POST /api/agent/service-point { machine, module } — make `module` this machine's only module. */
export async function POST(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const parsed = AgentServicePointRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error(400, { error: "invalid_body" });
  const { machine, module } = parsed.data;
  const machineId = await touchMachine(machine);
  if (machineId == null) return error(503, { error: "assist_unavailable" });
  try {
    const [known] = await assistQuery<{ code: string }>("SELECT code FROM modules WHERE code = $1 AND is_active", [module]);
    if (!known) return error(400, { error: "unknown_module" });
    await assistTransaction(async (db) => {
      await db.query("DELETE FROM machine_modules WHERE machine_id = $1", [machineId]);
      await db.query("INSERT INTO machine_modules (machine_id, module_code) VALUES ($1, $2)", [machineId, module]);
    });
    return Response.json(await body(machineId, machine));
  } catch {
    return error(503, { error: "assist_unavailable" });
  }
}
