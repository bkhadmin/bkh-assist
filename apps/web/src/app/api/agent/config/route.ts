import type { AgentConfigResponse, ApiError } from "@bkh/shared";
import { isAgentAuthorized } from "@/lib/agent-auth";
import { machineConfig, touchMachine } from "@/lib/check-store";

const error = (status: number, body: ApiError) => Response.json(body, { status });

/**
 * GET /api/agent/config?machine=<hostname>
 * The agent calls this at start and every few minutes. The first call also registers the machine,
 * so it shows up on the admin page before anyone saves anything in HOSxP.
 */
export async function GET(req: Request) {
  if (!isAgentAuthorized(req)) return error(401, { error: "unauthorized" });
  const machine = new URL(req.url).searchParams.get("machine")?.trim() ?? "";
  if (!machine || machine.length > 100) return error(400, { error: "invalid_machine" });

  const machineId = await touchMachine(machine);
  if (machineId == null) return error(503, { error: "assist_unavailable" });
  try {
    const cfg = await machineConfig(machineId);
    const body: AgentConfigResponse = { machine, active: cfg.active, modules: cfg.active ? cfg.modules : [] };
    return Response.json(body);
  } catch {
    return error(503, { error: "assist_unavailable" });
  }
}
