import type { Module } from "../types";

/**
 * OPDVisitcheck — ตรวจการบันทึกหน้าซักประวัติ OPD (HOSxP: TDoctorWorkBenchQueueManagerForm).
 *
 * SQL proven by prove-query on bkhosxp (MariaDB 10.11) 2026-11-05:
 * - empty values are stored as NULL (sometimes 0), never ''; `> 0` covers both
 * - EXISTS always returns one row, ok = 0 when the visit has no opdscreen row
 * - EXPLAIN: const lookup on ix_vn_unique (1 row)
 */
const has = (condition: string) => `SELECT EXISTS(SELECT 1 FROM opdscreen WHERE vn = ? AND ${condition}) AS ok`;

export const OPDVisitcheck: Module = {
  code: "OPDVisitcheck",
  label: "ซักประวัติ OPD",
  rules: [
    { code: "OPDVisitcheck.BP", label: "ความดันโลหิต (BP)", severity: "error", sql: has("bps > 0 AND bpd > 0") },
    { code: "OPDVisitcheck.PULSE", label: "ชีพจร", severity: "error", sql: has("pulse > 0") },
    { code: "OPDVisitcheck.TEMP", label: "อุณหภูมิ", severity: "error", sql: has("temperature > 0") },
    { code: "OPDVisitcheck.BW", label: "น้ำหนัก", severity: "error", sql: has("bw > 0") },
    { code: "OPDVisitcheck.HEIGHT", label: "ส่วนสูง", severity: "error", sql: has("height > 0") },
    { code: "OPDVisitcheck.CC", label: "อาการสำคัญ (CC)", severity: "error", sql: has("TRIM(cc) <> ''") },
  ],
};
