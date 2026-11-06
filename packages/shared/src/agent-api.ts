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

/**
 * An add-on "opportunity" (e.g. the patient qualifies for a billable PP service) matched for this visit.
 * Separate from rule results: it never makes a check "missing", it is only shown as a hint at the point of care.
 */
export const OpportunitySchema = z.object({
  code: z.string(),
  /** e.g. "PP" */
  category: z.string(),
  /** message shown to staff, e.g. "คัดกรองมะเร็งปากมดลูก" */
  label: z.string(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const CheckResponseSchema = z.object({
  status: CheckStatusSchema,
  vn: z.string().optional(),
  hn: z.string().optional(),
  results: z.array(RuleResultSchema),
  candidates: z.array(VisitCandidateSchema).optional(),
  /** default [] so an agent keeps working against an older server */
  opportunities: z.array(OpportunitySchema).default([]),
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

/**
 * `GET /api/agent/hba1c?hn=<hn>&machine=<hostname>`: the patient's last 3 reported HbA1c results, newest first.
 * Shown in the agent's top bar. Only date and value, never names/CID.
 */
export const HbA1cResultSchema = z.object({
  /** order date, "YYYY-MM-DD" (HIS local date) */
  date: z.string(),
  /** as reported by the lab, e.g. "6.8" */
  value: z.string(),
});
export const HbA1cResponseSchema = z.object({
  hn: z.string(),
  results: z.array(HbA1cResultSchema),
});
export type HbA1cResponse = z.infer<typeof HbA1cResponseSchema>;
/** Top bar light: green when the latest HbA1c was ordered at most this many days ago, red when older. */
export const HBA1C_MAX_AGE_DAYS = 90;

/** Header carrying the agent key. */
export const AGENT_KEY_HEADER = "x-agent-key";
