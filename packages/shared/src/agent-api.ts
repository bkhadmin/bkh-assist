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
  /** baht: the admin manual price (e.g. an NHSO lump sum), else the sum of the HOSxP prices of its icodes; null/absent = neither set (agent endpoint only) */
  price: z.number().nullable().optional(),
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

/**
 * `GET /api/agent/rlu?hn=<hn>&machine=<hostname>`: RLU (Rational Lab Use) items set in admin, for the top bar
 * "RLU" badge. Each item is a lab (one or more lab_items_code) with admin-defined conditions (same engine and
 * sources as opportunities); `warn` = its conditions match the patient's latest visit. The badge blinks when any
 * item warns. Only dates and values, never names/CID.
 */
export const RluResultSchema = z.object({
  /** order date, "YYYY-MM-DD" (HIS local date) */
  date: z.string(),
  /** as reported by the lab, e.g. "6.8" */
  value: z.string(),
  /** lab_items.lab_items_name of this result, e.g. "HbA1c" (an item may span several lab codes) */
  name: z.string(),
});
export const RluItemSchema = z.object({
  code: z.string(),
  /** e.g. "HbA1c" */
  label: z.string(),
  /** the item's conditions match the latest visit */
  warn: z.boolean(),
  /** admin text shown with a warning, e.g. "ไม่ได้ตรวจเกิน 90 วัน"; null = none set */
  message: z.string().nullable(),
  /** last 3 reported results of the item's lab codes, newest first */
  results: z.array(RluResultSchema),
});
export type RluItem = z.infer<typeof RluItemSchema>;
export const AgentRluResponseSchema = z.object({
  hn: z.string(),
  /** the visit the conditions were evaluated on; null = no visit */
  vn: z.string().nullable(),
  /** active items in admin order (every active item, warning or not) */
  items: z.array(RluItemSchema),
});
export type AgentRluResponse = z.infer<typeof AgentRluResponseSchema>;

/** `GET /api/agent/opportunities?hn=<hn>&machine=<hostname>`: opportunities the patient's latest visit matches. */
export const AgentOpportunitiesResponseSchema = z.object({
  hn: z.string(),
  /** the visit that was evaluated; null = no visit, or no opportunity is switched on for this machine */
  vn: z.string().nullable(),
  items: z.array(OpportunitySchema),
});
export type AgentOpportunitiesResponse = z.infer<typeof AgentOpportunitiesResponseSchema>;

/** `GET /api/agent/authen?hn=<hn>`: NHSO authentication (Authen Code) of the patient's latest visit. */
export const AgentAuthenResponseSchema = z.object({
  hn: z.string(),
  /** "นายสมชาย ใจดี" (pname fname lname), shown after the HN; null = HN not found. Never logged. */
  name: z.string().nullable().default(null),
  /** date of the latest visit, "YYYY-MM-DD"; null = the patient has no visit */
  visitDate: z.string().nullable(),
  /** visit date and time, "YYYY-MM-DD HH:mm" (HOSxP does not record when the Authen Code was requested) */
  visitAt: z.string().nullable(),
  /** NHSO Authen Code (EP…/PP…); null = not authenticated */
  authCode: z.string().nullable(),
  /** pttype.hipdata_code of the latest visit's main right, e.g. "UCS", "OFC" */
  hipdata: z.string().nullable(),
});
export type AgentAuthenResponse = z.infer<typeof AgentAuthenResponseSchema>;

/** `GET|POST /api/agent/service-point`: the module ("จุดบริการ") this machine checks, set from the agent. */
export const AgentServicePointResponseSchema = z.object({
  machine: z.string(),
  /** false = an admin switched this machine off */
  active: z.boolean(),
  modules: z.array(z.object({ code: z.string(), label: z.string(), description: z.string().nullable() })),
  selected: z.array(z.string()),
});
export type AgentServicePointResponse = z.infer<typeof AgentServicePointResponseSchema>;
export const AgentServicePointRequestSchema = z.object({
  machine: z.string().trim().min(1).max(100),
  module: z.string().trim().min(1).max(50),
});

/** Header carrying the agent key. */
export const AGENT_KEY_HEADER = "x-agent-key";
