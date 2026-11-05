import type { Severity } from "@bkh/shared";

/**
 * One validation rule.
 *
 * `sql` contract (checked by hisQuery + runRules):
 * - a single HIS SELECT/WITH statement taking exactly ONE `?` param: the VN
 * - returns one row with column `ok` = 1 (field present / passed) or 0 (missing)
 * - zero rows is treated as failed
 * - must not select patient names/CID; only `ok` is read
 */
export type Rule = {
  /** Stable code, e.g. "OPDVisitcheck.BP". Sent to the agent. */
  code: string;
  /** Thai label shown in the agent alert. */
  label: string;
  severity: Severity;
  sql: string;
};

/** A module = set of rules enabled per machine (e.g. OPD screening). */
export type Module = {
  code: string;
  label: string;
  rules: Rule[];
};
