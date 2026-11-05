import { z } from "zod";

/**
 * Agent -> server contract for `POST /api/agent/check`.
 * Shared by apps/web (server) and the Windows agent (client).
 *
 * Privacy: these payloads must never carry patient names or CID.
 */

export const CheckRequestSchema = z.object({
  /** Machine identifier of the agent (hostname or enrolled machine id). */
  machine: z.string().trim().min(1).max(100),
  /** Module code enabled on that machine, e.g. "OPDVisitcheck". */
  module: z.string().trim().min(1).max(50),
  /** HN shown on the HOSxP screen when the user clicked save (optional). */
  hn: z.string().trim().min(1).max(20).optional(),
  /** VN, if the agent could read it directly (optional). */
  vn: z.string().trim().min(1).max(20).optional(),
  /** When the user clicked save, ISO 8601 with offset or Z, e.g. "2026-11-05T09:15:00+07:00". */
  savedAt: z.iso.datetime({ offset: true }),
});
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export const CheckStatusSchema = z.enum(["ok", "missing", "ambiguous", "not_found"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const SeveritySchema = z.enum(["error", "warning"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const RuleResultSchema = z.object({
  code: z.string(),
  label: z.string(),
  passed: z.boolean(),
  severity: SeveritySchema,
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const VisitCandidateSchema = z.object({
  vn: z.string(),
  hn: z.string(),
  /** Last update time of the visit as reported by HIS ("YYYY-MM-DD HH:mm:ss", HIS local time). */
  updatedAt: z.string(),
});
export type VisitCandidate = z.infer<typeof VisitCandidateSchema>;

export const CheckResponseSchema = z.object({
  status: CheckStatusSchema,
  vn: z.string().optional(),
  hn: z.string().optional(),
  results: z.array(RuleResultSchema),
  candidates: z.array(VisitCandidateSchema).optional(),
});
export type CheckResponse = z.infer<typeof CheckResponseSchema>;

/** Error body returned with 4xx/5xx from agent endpoints. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * `GET /api/agent/config?machine=<hostname>`: the modules this machine checks, as set on the admin page.
 * The agent picks a module by the HOSxP form whose save button was pressed (`hosxpForm`).
 */
export const AgentModuleSchema = z.object({
  code: z.string(),
  label: z.string(),
  /** Delphi form class of the HOSxP screen, e.g. "TDoctorWorkBenchQueueManagerForm". */
  hosxpForm: z.string().nullable(),
});
export type AgentModule = z.infer<typeof AgentModuleSchema>;

export const AgentConfigResponseSchema = z.object({
  machine: z.string(),
  /** false = an admin switched this machine off: the agent checks nothing. */
  active: z.boolean(),
  modules: z.array(AgentModuleSchema),
});
export type AgentConfigResponse = z.infer<typeof AgentConfigResponseSchema>;

/** Header carrying the agent key. */
export const AGENT_KEY_HEADER = "x-agent-key";
