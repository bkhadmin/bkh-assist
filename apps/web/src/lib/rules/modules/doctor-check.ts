import type { Module } from "../types";

/**
 * Doctorcheck — ตรวจการบันทึกของแพทย์ในห้องตรวจ (HOSxP: TDoctorWorkBenchQueueManagerForm,
 * the same screen as OPDVisitcheck; a machine gets one of the two on the admin page).
 *
 * SQL proven by prove-query on bkhosxp (MariaDB 10.11) 2026-11-06. Pass rates over 3,923 visits with a
 * diagnosis in the 7 days before: DOCTOR 100%, PDX 98.3%, EXTERNAL_CAUSE 100%, PE 34%, HPI 72%.
 * - icd10 is stored upper-case without dots (S099, X599); diagtype '1' = principal diagnosis
 * - opdscreen.hpi has been empty for 17 months; HPI lives in patient_history_hpi.hpi_text
 * - PE is recorded either as text (pe / pe_rtf), as per-system flags (pe_ga … 'Y'/'N') or their *_text
 * Every rule takes the VN as its single parameter and returns one row with `ok` (1/0).
 */
const PE_PARTS = [
  "TRIM(pe)", "TRIM(pe_rtf)",
  "pe_ga", "pe_heent", "pe_heart", "pe_lung", "pe_ab", "pe_ext", "pe_neuro", "pe_gy", "pe_gu", "pe_gi",
  "pe_head", "pe_skin", "pe_pv", "pe_pr", "pe_gen", "pe_chest",
  "TRIM(pe_ga_text)", "TRIM(pe_heent_text)", "TRIM(pe_heart_text)", "TRIM(pe_lung_text)", "TRIM(pe_ab_text)",
  "TRIM(pe_neuro_text)", "TRIM(pe_ext_text)", "TRIM(pe_gy_text)", "TRIM(pe_gu_text)", "TRIM(pe_gi_text)",
  "TRIM(pe_head_text)", "TRIM(pe_skin_text)", "TRIM(pe_pv_text)", "TRIM(pe_pr_text)", "TRIM(pe_gen_text)",
  "TRIM(pe_chest_text)",
].join(", ");

export const Doctorcheck: Module = {
  code: "Doctorcheck",
  label: "ห้องตรวจแพทย์",
  rules: [
    {
      code: "Doctorcheck.DOCTOR",
      label: "แพทย์ผู้ตรวจ",
      severity: "error",
      // ovst.doctor (empty = NULL) or ovstdiag.doctor (empty = ''), and the code must exist in `doctor`
      sql: `SELECT (EXISTS(SELECT 1 FROM ovst o JOIN doctor dr ON dr.code = o.doctor WHERE o.vn = p.vn)
              OR EXISTS(SELECT 1 FROM ovstdiag d JOIN doctor dr ON dr.code = d.doctor WHERE d.vn = p.vn)) AS ok
            FROM (SELECT ? AS vn) p`,
    },
    {
      code: "Doctorcheck.PDX",
      label: "การวินิจฉัยหลัก (Principal Dx)",
      severity: "error",
      sql: "SELECT EXISTS(SELECT 1 FROM ovstdiag WHERE vn = ? AND diagtype = '1' AND icd10 IS NOT NULL AND TRIM(icd10) <> '') AS ok",
    },
    {
      code: "Doctorcheck.DIAG_TEXT",
      label: "คำวินิจฉัย (ข้อความ)",
      severity: "warning",
      // ovst.diag_text: empty = NULL; '-' / '-1' are placeholders, not a diagnosis. Filled on 42% of visits
      // with a diagnosis (2026-10-30 … 11-05), hence warning. EXPLAIN: const on ix_vn_unique.
      sql: "SELECT EXISTS(SELECT 1 FROM ovst WHERE vn = ? AND TRIM(diag_text) NOT IN ('', '-', '-1')) AS ok",
    },
    {
      code: "Doctorcheck.EXTERNAL_CAUSE",
      label: "รหัสสาเหตุภายนอก (V–Y) ของการบาดเจ็บ",
      severity: "error",
      // passes when there is no injury code (S00–T98) at all, or there is also an external cause (V01–Y98)
      sql: `SELECT (COALESCE(SUM(icd10 REGEXP '^(S[0-9]{2}|T([0-8][0-9]|9[0-8]))'), 0) = 0
              OR COALESCE(SUM(icd10 REGEXP '^([VWX][0-9]{2}|Y([0-8][0-9]|9[0-8]))'), 0) > 0) AS ok
            FROM ovstdiag WHERE vn = ?`,
    },
    {
      code: "Doctorcheck.PE",
      label: "การตรวจร่างกาย (PE)",
      severity: "warning",
      sql: `SELECT EXISTS(SELECT 1 FROM opdscreen WHERE vn = ? AND CONCAT_WS('', ${PE_PARTS}) <> '') AS ok`,
    },
    {
      code: "Doctorcheck.HPI",
      label: "ประวัติการเจ็บป่วยปัจจุบัน (HPI)",
      severity: "warning",
      sql: "SELECT EXISTS(SELECT 1 FROM patient_history_hpi WHERE vn = ? AND TRIM(hpi_text) <> '') AS ok",
    },
  ],
};
