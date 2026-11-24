import type { Rule } from "../types";

/**
 * A urine pregnancy test needs the code that matches its result: Negative -> Z32.0, Positive -> Z32.1.
 * Used by several modules (ห้องตรวจแพทย์, ซักประวัติ OPD, งานเวชระเบียน); rule_settings needs one code per module.
 *
 * bkhosxp 2026-11-24: lab 67 "Pregnancy Test (UPT)", lab_order.lab_order_result over a year: Negative 868,
 * Positive 131, Weakly Positive 3 (taken as positive), NULL/'' 9 (no result yet: not checked, passes).
 * A visit with any positive UPT needs Z32.1, else with a negative one Z32.0; no UPT order passes.
 * REGEXP is case-insensitive here (utf8 general collation). EXPLAIN: ref on lab_head.vn, eq_ref lab_order PK,
 * ref on ovstdiag ix_vn_icd_unique (~3 ms). Cancelled orders are deleted by HOSxP (no flag to filter).
 */
const SQL = `SELECT CASE
    WHEN SUM(o.lab_order_result REGEXP 'positive') > 0
      THEN EXISTS(SELECT 1 FROM ovstdiag d WHERE d.vn = p.vn AND d.icd10 REGEXP '^Z321')
    WHEN SUM(o.lab_order_result REGEXP 'negative') > 0
      THEN EXISTS(SELECT 1 FROM ovstdiag d WHERE d.vn = p.vn AND d.icd10 REGEXP '^Z320')
    ELSE 1 END AS ok
  FROM (SELECT ? AS vn) p
  LEFT JOIN lab_head h ON h.vn = p.vn
  LEFT JOIN lab_order o ON o.lab_order_number = h.lab_order_number AND o.lab_items_code = '67'
  GROUP BY p.vn`;

export const uptZ32Rule = (moduleCode: string): Rule => ({
  code: `${moduleCode}.UPT_Z32`,
  label: "ผล Urine pregnancy test ต้องลงรหัส: ผลลบ Z32.0 · ผลบวก Z32.1",
  severity: "error",
  sql: SQL,
});
