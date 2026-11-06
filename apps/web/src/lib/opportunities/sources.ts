/**
 * Data sources for opportunity conditions ("โอกาสเพิ่มรายได้", e.g. PP).
 *
 * An admin builds a condition from a source + one of its columns + an operator + a value.
 * The SQL lives here only, so an admin never writes SQL that runs on HIS (same rule as validation rules).
 * Some sources take a list of codes (PP codes, vaccine codes, ...) from the admin; those are bound as `?` params.
 *
 * SQL proven on bkhosxp (MariaDB 10.11) 2026-11-06, EXPLAIN: const lookup of the visit by vn, then ref lookups
 * by hn / person_id. Every query returns exactly one row for an existing VN (LEFT JOIN + GROUP BY the visit).
 * - history window is 10 years back from the visit date, the current visit included
 * - pp_special.pp_special_code is blank in practice; the code comes from pp_special_type
 * - person_anc keeps hundreds of never-closed pregnancies, so "pregnant" also requires LMP/registration < 300 days
 * - count_fy = fiscal year (1 Oct) of the visit
 */

export type ColumnType = "number" | "text";
export type SourceColumn = { name: string; label: string; type: ColumnType };
export type SourceParam = { label: string; hint: string; pattern: RegExp };

export type DataSource = {
  code: string;
  label: string;
  description: string;
  /** a list of codes the admin fills in for each condition (undefined = no input) */
  param?: SourceParam;
  columns: SourceColumn[];
  /** SQL and its params in placeholder order; `codes` is non-empty when `param` is set */
  build(codes: string[], vn: string): { sql: string; params: string[] };
};

const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");
const FY_START = "MAKEDATE(YEAR(o.vstdate) - (MONTH(o.vstdate) < 10), 1) + INTERVAL 9 MONTH";
const WINDOW = (col: string) => `${col} BETWEEN o.vstdate - INTERVAL 10 YEAR AND o.vstdate`;

const HISTORY_COLUMNS: SourceColumn[] = [
  { name: "days_since", label: "จำนวนวันนับจากครั้งล่าสุด (ว่าง = ไม่เคย)", type: "number" },
  { name: "count_fy", label: "จำนวนครั้งในปีงบประมาณนี้", type: "number" },
];

const CODE = /^[0-9A-Za-z.+_-]{1,20}$/;

/** "Pregnant now": an open ANC record that is not years old. */
const CURRENT_PREG = "a.discharge = 'N' AND a.labor_date IS NULL AND COALESCE(a.lmp, a.anc_register_date) >= o.vstdate - INTERVAL 300 DAY";

export const SOURCES: DataSource[] = [
  {
    code: "patient",
    label: "ข้อมูลผู้ป่วย",
    description: "อายุ ณ วันที่มารับบริการ เพศ สัญชาติ สิทธิ (รหัสสิทธิ และกลุ่มสิทธิ hipdata เช่น UCS, OFC, SSS, LGO)",
    columns: [
      { name: "age_y", label: "อายุ (ปี)", type: "number" },
      { name: "age_m", label: "อายุ (เดือน)", type: "number" },
      { name: "sex", label: "เพศ (1 = ชาย, 2 = หญิง)", type: "text" },
      { name: "nationality", label: "สัญชาติ (99 = ไทย)", type: "text" },
      { name: "pttype", label: "รหัสสิทธิของ visit", type: "text" },
      { name: "hipdata", label: "กลุ่มสิทธิ hipdata (UCS, OFC, SSS, LGO …)", type: "text" },
    ],
    build: (_codes, vn) => ({
      sql: `SELECT TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) AS age_y, TIMESTAMPDIFF(MONTH, p.birthday, o.vstdate) AS age_m,
              p.sex, p.nationality, o.pttype, (SELECT t.hipdata_code FROM pttype t WHERE t.pttype = o.pttype) AS hipdata
            FROM ovst o JOIN patient p ON p.hn = o.hn WHERE o.vn = ?`,
      params: [vn],
    }),
  },
  {
    code: "anc",
    label: "การตั้งครรภ์และหลังคลอด",
    description: "จากทะเบียนฝากครรภ์ (person_anc)",
    columns: [
      { name: "pregnant", label: "กำลังตั้งครรภ์ (1/0)", type: "number" },
      { name: "ga_weeks", label: "อายุครรภ์ (สัปดาห์ จาก LMP)", type: "number" },
      { name: "days_since_anc", label: "วันนับจากฝากครรภ์ครั้งล่าสุด (ว่าง = ยังไม่เคย)", type: "number" },
      { name: "ultrasound_count", label: "จำนวนครั้งอัลตราซาวด์ในครรภ์นี้", type: "number" },
      { name: "dental_done", label: "ตรวจ/รักษาช่องปากในครรภ์นี้แล้ว (1/0)", type: "number" },
      { name: "postpartum_days", label: "วันหลังคลอด (ว่าง = ไม่มีประวัติคลอด)", type: "number" },
      { name: "postpartum_visits", label: "จำนวนครั้งที่ตรวจหลังคลอดแล้ว (คลอดใน 42 วัน)", type: "number" },
    ],
    build: (_codes, vn) => ({
      sql: `SELECT COALESCE(MAX(${CURRENT_PREG}), 0) AS pregnant,
              FLOOR(DATEDIFF(o.vstdate, MAX(CASE WHEN ${CURRENT_PREG} THEN a.lmp END)) / 7) AS ga_weeks,
              DATEDIFF(o.vstdate, MAX(CASE WHEN ${CURRENT_PREG} THEN s.anc_service_date END)) AS days_since_anc,
              COUNT(DISTINCT CASE WHEN ${CURRENT_PREG} AND s.ultrasound_flag = 'Y' THEN s.person_anc_service_id END) AS ultrasound_count,
              COALESCE(MAX(${CURRENT_PREG} AND a.dental_tx_date IS NOT NULL), 0) AS dental_done,
              DATEDIFF(o.vstdate, MAX(a.labor_date)) AS postpartum_days,
              MAX(CASE WHEN a.labor_date >= o.vstdate - INTERVAL 42 DAY THEN
                (a.post_labor_service1_date IS NOT NULL) + (a.post_labor_service2_date IS NOT NULL) + (a.post_labor_service3_date IS NOT NULL) END) AS postpartum_visits
            FROM ovst o
            LEFT JOIN person pe ON pe.patient_hn = o.hn
            LEFT JOIN person_anc a ON a.person_id = pe.person_id AND a.anc_register_date <= o.vstdate
            LEFT JOIN person_anc_service s ON s.person_anc_id = a.person_anc_id AND s.anc_service_date <= o.vstdate
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [vn],
    }),
  },
  {
    code: "pp_special",
    label: "บริการ PP (รหัส pp_special)",
    description: "ประวัติการบันทึกรหัสบริการส่งเสริมป้องกัน เช่น 1B0046, 1B1220",
    param: { label: "รหัส PP", hint: "คั่นด้วยจุลภาค เช่น 1B30, 1B40, 1B0046", pattern: CODE },
    columns: HISTORY_COLUMNS,
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.vstdate >= ${FY_START} THEN h.vn END) AS count_fy
            FROM ovst o
            LEFT JOIN (ovst h JOIN pp_special ps ON ps.vn = h.vn
                       JOIN pp_special_type t ON t.pp_special_type_id = ps.pp_special_type_id AND t.pp_special_code IN (${marks(codes.length)}))
              ON h.hn = o.hn AND ${WINDOW("h.vstdate")}
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "vaccine",
    label: "วัคซีน (รหัสส่งออก)",
    description: "ประวัติวัคซีนที่ให้ใน รพ. ตาม person_vaccine.export_vaccine_code เช่น 815 = ไข้หวัดใหญ่",
    param: { label: "รหัสวัคซีน (export)", hint: "คั่นด้วยจุลภาค เช่น 815, 817", pattern: CODE },
    columns: HISTORY_COLUMNS,
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.vstdate >= ${FY_START} THEN h.vn END) AS count_fy
            FROM ovst o
            LEFT JOIN (ovst h JOIN ovst_vaccine ov ON ov.vn = h.vn
                       JOIN person_vaccine pv ON pv.person_vaccine_id = ov.person_vaccine_id AND pv.export_vaccine_code IN (${marks(codes.length)}))
              ON h.hn = o.hn AND ${WINDOW("h.vstdate")}
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "lab",
    label: "แล็บ (รหัส lab_items)",
    description: "ประวัติการสั่งแล็บ เช่น 978 = FIT test, 1017 = HPV DNA",
    param: { label: "รหัสแล็บ (lab_items_code)", hint: "คั่นด้วยจุลภาค เช่น 978, 294", pattern: /^[0-9]{1,9}$/ },
    columns: HISTORY_COLUMNS,
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.order_date)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.order_date >= ${FY_START} THEN h.lab_order_number END) AS count_fy
            FROM ovst o
            LEFT JOIN (lab_head h JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number AND lo.lab_items_code IN (${marks(codes.length)}))
              ON h.hn = o.hn AND ${WINDOW("h.order_date")}
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "diag",
    label: "การวินิจฉัย (ICD-10)",
    description: "ประวัติการวินิจฉัย OPD ขึ้นต้นด้วยรหัสที่ระบุ เช่น E11 = เบาหวาน, I10 = ความดัน",
    param: { label: "ICD-10 (ขึ้นต้นด้วย)", hint: "คั่นด้วยจุลภาค ไม่มีจุด เช่น E11, I10", pattern: /^[A-Z][0-9A-Z]{0,6}$/ },
    columns: HISTORY_COLUMNS,
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.vstdate >= ${FY_START} THEN h.vn END) AS count_fy
            FROM ovst o
            LEFT JOIN ovstdiag h ON h.hn = o.hn AND ${WINDOW("h.vstdate")}
              AND (${codes.map(() => "h.icd10 LIKE ?").join(" OR ")})
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes.map((c) => `${c}%`), vn],
    }),
  },
  {
    code: "drug",
    label: "ยา/เวชภัณฑ์ (icode)",
    description: "ประวัติการจ่ายยาหรือรายการค่าบริการ OPD (opitemrece) ตาม icode",
    param: { label: "icode", hint: "คั่นด้วยจุลภาค เช่น 1650047, 1000131", pattern: /^[0-9A-Za-z]{1,10}$/ },
    columns: HISTORY_COLUMNS,
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.vstdate >= ${FY_START} THEN h.vn END) AS count_fy
            FROM ovst o
            LEFT JOIN opitemrece h ON h.hn = o.hn AND ${WINDOW("h.vstdate")} AND h.icode IN (${marks(codes.length)})
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "dmht_screen",
    label: "คัดกรองเบาหวาน/ความดัน (NCD)",
    description: "แบบคัดกรองความเสี่ยง DM/HT ของ HOSxP (person_dmht_risk_screen_head)",
    columns: HISTORY_COLUMNS,
    build: (_codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(h.screen_date)) AS days_since,
              COUNT(DISTINCT CASE WHEN h.screen_date >= ${FY_START} THEN h.person_dmht_risk_screen_head_id END) AS count_fy
            FROM ovst o
            LEFT JOIN (person pe JOIN person_dmht_screen_summary s ON s.person_id = pe.person_id
                       JOIN person_dmht_risk_screen_head h ON h.person_dmht_screen_summary_id = s.person_dmht_screen_summary_id)
              ON pe.patient_hn = o.hn AND h.screen_date <= o.vstdate
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [vn],
    }),
  },
];

const BY_CODE = new Map(SOURCES.map((s) => [s.code, s]));
export const getSource = (code: string) => BY_CODE.get(code);
