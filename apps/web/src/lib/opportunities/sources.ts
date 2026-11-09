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

/** A lab row that counts as a result: reported and not blank. */
const LAB_REPORTED = "h.confirm_report = 'Y' AND TRIM(lo.lab_order_result) <> ''";

/** "Pregnant now": an open ANC record that is not years old. */
const CURRENT_PREG = "a.discharge = 'N' AND a.labor_date IS NULL AND COALESCE(a.lmp, a.anc_register_date) >= o.vstdate - INTERVAL 300 DAY";

/** Postpartum visit window of a delivery `d` days before the visit: 1 = day 0–7, 2 = 8–15, 3 = 16–42, else NULL. */
const PNC_IN = "a.labor_date BETWEEN o.vstdate - INTERVAL 42 DAY AND o.vstdate";
const PNC_NO = (d: string) => `CASE WHEN ${d} <= 7 THEN 1 WHEN ${d} <= 15 THEN 2 WHEN ${d} <= 42 THEN 3 END`;

/**
 * Lab result as a number: a leading bound sign is dropped and the leading number kept (">90" → 90, "< 30" → 30,
 * "52.24[Stage=3A]" → 52.24, "2+" → 2); text ("Negative", "ส่ง") → NULL, never 0, so it cannot trip a "lt" rule.
 */
const LAB_NUM = `NULLIF(REGEXP_SUBSTR(REGEXP_REPLACE(TRIM(lo.lab_order_result), '^[<>=]+ *', ''), '^-?[0-9]+([.][0-9]+)?'), '') + 0`;

const LAB_COLUMNS: SourceColumn[] = [
  ...HISTORY_COLUMNS,
  { name: "last_value", label: "ผลล่าสุดที่รายงานแล้ว (ตัวเลข; ว่าง = ไม่มี/ไม่ใช่ตัวเลข)", type: "number" },
  { name: "prev_value", label: "ค่าผลครั้งก่อนหน้า (ตัวเลข; ว่าง = ไม่มี/ไม่ใช่ตัวเลข)", type: "number" },
  { name: "prev2_value", label: "ค่าผลก่อนหน้า 2 ครั้ง (ตัวเลข; ว่าง = ไม่มี/ไม่ใช่ตัวเลข)", type: "number" },
  { name: "days_last_prev", label: "จำนวนวันระหว่างผลล่าสุดกับครั้งก่อน (ว่าง = ไม่มีผลครั้งก่อน)", type: "number" },
  { name: "days_prev_prev2", label: "จำนวนวันระหว่างผลครั้งก่อนกับก่อนหน้านั้น (ว่าง = ไม่มีผล)", type: "number" },
  { name: "age_m_last", label: "อายุผู้ป่วย (เดือน) ตอนสั่งครั้งล่าสุด (ว่าง = ไม่เคย)", type: "number" },
];

/**
 * Lab history of the visit's patient; `match` filters lab_order rows (`lo`) to the wanted tests.
 * Result columns: reported results (confirm_report = 'Y', non-empty) up to the visit, newest first (order date/time,
 * then lab_order_number); rn 1 = last, 2 = prev, 3 = prev2. A non-numeric result ("Negative") still takes its place
 * in the sequence with value NULL, so "prev_value lt 6.5" fails instead of skipping to an older result.
 * days_* = days between the order dates. History columns (days_since, count_fy, age_m_last) count every order,
 * reported or not.
 * Proven 2026-11-07 on bkhosxp (MariaDB 10.11.13) with HbA1c (334): one pass over the patient's lab rows. EXPLAIN:
 * derived table (window function, materialized once): o const by vn, range on lab_head.ix_hn_order_date (~55 rows),
 * eq_ref on lab_order PRIMARY; outer filesort of those rows. 1-2 ms on VNs with >= 4, 1 and 0 results and with a
 * non-numeric result (old two-pass query 1-7 ms); days_since/count_fy/last_value equal the old query; unknown VN = no row.
 * Re-proven 2026-11-09 after sharing it with lab_provis, adding age_m_last (patient eq_ref by hn) and LAB_NUM: same plan
 * plus p const; lab_provis = lo ref on PRIMARY + unique_subquery on lab_items PRIMARY per row (no provis_labcode
 * index needed). 200 recent VNs each for HbA1c / eGFR / Chol: lab = lab_provis on every column, and equal to the old
 * query except 1 eGFR prev_value (a result with trailing text that now parses to its leading number); avg 1.4-2.1 ms, max 6.6 ms.
 * (Results here are almost always clean numbers; the parse matters for sites that file ">90".)
 */
const labHistory = (match: string) => `SELECT DATEDIFF(x.vstdate, MAX(x.order_date)) AS days_since,
    COUNT(DISTINCT CASE WHEN x.in_fy THEN x.lab_order_number END) AS count_fy,
    MAX(CASE WHEN x.rn = 1 THEN x.val END) AS last_value,
    MAX(CASE WHEN x.rn = 2 THEN x.val END) AS prev_value,
    MAX(CASE WHEN x.rn = 3 THEN x.val END) AS prev2_value,
    DATEDIFF(MAX(CASE WHEN x.rn = 1 THEN x.order_date END), MAX(CASE WHEN x.rn = 2 THEN x.order_date END)) AS days_last_prev,
    DATEDIFF(MAX(CASE WHEN x.rn = 2 THEN x.order_date END), MAX(CASE WHEN x.rn = 3 THEN x.order_date END)) AS days_prev_prev2,
    TIMESTAMPDIFF(MONTH, x.birthday, MAX(x.order_date)) AS age_m_last
  FROM (SELECT o.vn, o.vstdate, p.birthday, h.order_date, h.lab_order_number, h.order_date >= ${FY_START} AS in_fy,
          ${LAB_NUM} AS val,
          CASE WHEN ${LAB_REPORTED} THEN ROW_NUMBER() OVER (PARTITION BY ${LAB_REPORTED}
            ORDER BY h.order_date DESC, h.order_time DESC, h.lab_order_number DESC) END AS rn
        FROM ovst o
        LEFT JOIN patient p ON p.hn = o.hn
        LEFT JOIN (lab_head h JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number AND ${match})
          ON h.hn = o.hn AND ${WINDOW("h.order_date")}
        WHERE o.vn = ?) x
  GROUP BY x.vn, x.vstdate, x.birthday`;

/**
 * The visit patient's current pregnancy (TopStickly's ANC_ID, as of the visit date): the newest person_anc
 * registered within 10 months, not discharged, and not yet delivered (labor_date, else edc + 14 d, else
 * lmp + 294 d, else registration + 280 d). Also drops records keyed with Buddhist-era dates.
 */
const ANC_CURRENT = `(SELECT a2.person_anc_id FROM person_anc a2 JOIN person pe ON pe.person_id = a2.person_id
    WHERE pe.patient_hn = o.hn AND a2.anc_register_date BETWEEN o.vstdate - INTERVAL 10 MONTH AND o.vstdate
      AND COALESCE(a2.labor_date, a2.edc + INTERVAL 14 DAY, a2.lmp + INTERVAL 294 DAY, a2.anc_register_date + INTERVAL 280 DAY) > o.vstdate
      AND NOT (COALESCE(a2.discharge, 'N') = 'Y' AND COALESCE(a2.discharge_date, '1000-01-01') <= o.vstdate)
    ORDER BY a2.person_anc_id DESC LIMIT 1)`;
const GA = "FLOOR(DATEDIFF(o.vstdate, COALESCE(a.lmp, a.edc - INTERVAL 280 DAY)) / 7)";

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
      { name: "birth_year_be", label: "ปีเกิด (พ.ศ.)", type: "number" },
    ],
    build: (_codes, vn) => ({
      sql: `SELECT TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) AS age_y, TIMESTAMPDIFF(MONTH, p.birthday, o.vstdate) AS age_m,
              YEAR(p.birthday) + 543 AS birth_year_be, p.sex, p.nationality, o.pttype, (SELECT t.hipdata_code FROM pttype t WHERE t.pttype = o.pttype) AS hipdata
            FROM ovst o JOIN patient p ON p.hn = o.hn WHERE o.vn = ?`,
      params: [vn],
    }),
  },
  {
    code: "anc",
    label: "การตั้งครรภ์และหลังคลอด",
    description: "จากทะเบียนฝากครรภ์ (person_anc)",
    // pnc_no / pnc_window_done (TopStickly ppPnc) use deliveries in the last 42 days. Re-proven 2026-11-09: same plan
    // (o const, person ref ix_hn, person_anc ref ix_person_id, service ref ix_person_anc_id), 1-1.5 ms; checked on
    // deliveries 0, 11 and 24 days back (pnc_no 1, 2, 3).
    columns: [
      { name: "pregnant", label: "กำลังตั้งครรภ์ (1/0)", type: "number" },
      { name: "ga_weeks", label: "อายุครรภ์ (สัปดาห์ จาก LMP)", type: "number" },
      { name: "days_since_anc", label: "วันนับจากฝากครรภ์ครั้งล่าสุด (ว่าง = ยังไม่เคย)", type: "number" },
      { name: "ultrasound_count", label: "จำนวนครั้งอัลตราซาวด์ในครรภ์นี้", type: "number" },
      { name: "dental_done", label: "ตรวจ/รักษาช่องปากในครรภ์นี้แล้ว (1/0)", type: "number" },
      { name: "postpartum_days", label: "วันหลังคลอด (ว่าง = ไม่มีประวัติคลอด)", type: "number" },
      { name: "postpartum_visits", label: "จำนวนครั้งที่ตรวจหลังคลอดแล้ว (คลอดใน 42 วัน)", type: "number" },
      { name: "pnc_no", label: "ช่วงตรวจหลังคลอดวันนี้ (1 = 0–7 วัน, 2 = 8–15 วัน, 3 = 16–42 วัน; ว่าง = ไม่ได้คลอดใน 42 วัน)", type: "number" },
      { name: "pnc_window_done", label: "ตรวจหลังคลอดครั้งของช่วงนี้แล้ว (1/0; ว่าง = ไม่ได้คลอดใน 42 วัน)", type: "number" },
    ],
    build: (_codes, vn) => ({
      sql: `SELECT COALESCE(MAX(${CURRENT_PREG}), 0) AS pregnant,
              FLOOR(DATEDIFF(o.vstdate, MAX(CASE WHEN ${CURRENT_PREG} THEN a.lmp END)) / 7) AS ga_weeks,
              DATEDIFF(o.vstdate, MAX(CASE WHEN ${CURRENT_PREG} THEN s.anc_service_date END)) AS days_since_anc,
              COUNT(DISTINCT CASE WHEN ${CURRENT_PREG} AND s.ultrasound_flag = 'Y' THEN s.person_anc_service_id END) AS ultrasound_count,
              COALESCE(MAX(${CURRENT_PREG} AND a.dental_tx_date IS NOT NULL), 0) AS dental_done,
              DATEDIFF(o.vstdate, MAX(a.labor_date)) AS postpartum_days,
              MAX(CASE WHEN a.labor_date >= o.vstdate - INTERVAL 42 DAY THEN
                (a.post_labor_service1_date IS NOT NULL) + (a.post_labor_service2_date IS NOT NULL) + (a.post_labor_service3_date IS NOT NULL) END) AS postpartum_visits,
              ${PNC_NO(`DATEDIFF(o.vstdate, MAX(CASE WHEN ${PNC_IN} THEN a.labor_date END))`)} AS pnc_no,
              MAX(CASE WHEN ${PNC_IN} THEN COALESCE(ELT(${PNC_NO("DATEDIFF(o.vstdate, a.labor_date)")},
                a.post_labor_service1_date, a.post_labor_service2_date, a.post_labor_service3_date) <= o.vstdate, 0) END) AS pnc_window_done
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
    columns: LAB_COLUMNS,
    build: (codes, vn) => ({
      sql: labHistory(`lo.lab_items_code IN (${marks(codes.length)})`),
      params: [...codes, vn],
    }),
  },
  {
    code: "lab_provis",
    label: "แล็บ (รหัส LABTEST 43 แฟ้ม)",
    description: "เหมือน แล็บ (รหัส lab_items) แต่เลือกแล็บด้วยรหัสมาตรฐาน lab_items.provis_labcode เช่น 0531601 = HbA1c, 0746299 = HBsAg",
    param: { label: "รหัส LABTEST (provis_labcode 7 หลัก)", hint: "คั่นด้วยจุลภาค เช่น 0541602, 0541202", pattern: /^[0-9]{7}$/ },
    columns: LAB_COLUMNS,
    // lab_items has no index on provis_labcode (~740 rows); not needed, the IN subquery is a PK lookup (proof at labHistory)
    build: (codes, vn) => ({
      sql: labHistory(`lo.lab_items_code IN (SELECT i.lab_items_code FROM lab_items i WHERE i.provis_labcode IN (${marks(codes.length)}))`),
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
  {
    code: "xray",
    label: "เอกซเรย์ (รหัส xray_items)",
    description: "ประวัติการสั่งเอกซเรย์ (xray_report) ตาม xray_items_code เช่น 108 = CXR, 7 = Chest PA",
    param: { label: "รหัสเอกซเรย์ (xray_items_code)", hint: "คั่นด้วยจุลภาค เช่น 108, 7, 52", pattern: /^[0-9]{1,9}$/ },
    columns: HISTORY_COLUMNS,
    // date = request_date; count_fy counts request days. Proven 2026-11-09: o const, xray_report ref ix_ix_hn (~15 rows),
    // ~1 ms with and without CXR history; unknown VN = no row.
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(x.request_date)) AS days_since,
              COUNT(DISTINCT CASE WHEN x.request_date >= ${FY_START} THEN x.request_date END) AS count_fy
            FROM ovst o
            LEFT JOIN xray_report x ON x.hn = o.hn AND ${WINDOW("x.request_date")} AND x.xray_items_code IN (${marks(codes.length)})
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "dental",
    label: "ทันตกรรม (รหัสหัตถการ dttm)",
    description: "ประวัติหัตถการทันตกรรม (dtmain.tmcode) เช่น 000168 = เคลือบฟลูออไรด์วาร์นิช-เด็ก",
    param: { label: "รหัสหัตถการ (tmcode)", hint: "คั่นด้วยจุลภาค เช่น 000168, 000101", pattern: /^[0-9A-Za-z]{1,10}$/ },
    columns: HISTORY_COLUMNS,
    // count_fy counts treatment days. Proven 2026-11-09: o const, dtmain ref ix_hn (~3 rows), ~1 ms; unknown VN = no row.
    build: (codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(d.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN d.vstdate >= ${FY_START} THEN d.vstdate END) AS count_fy
            FROM ovst o
            LEFT JOIN dtmain d ON d.hn = o.hn AND ${WINDOW("d.vstdate")} AND d.tmcode IN (${marks(codes.length)})
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [...codes, vn],
    }),
  },
  {
    code: "growth",
    label: "ชั่งน้ำหนักและวัดส่วนสูง",
    description: "หน้าซักประวัติ (opdscreen) ที่บันทึกทั้งน้ำหนักและส่วนสูง (bw > 0 และ height > 0)",
    columns: HISTORY_COLUMNS,
    // Proven 2026-11-09: o const, opdscreen range ix_hn_height (hn, height > 0; ~27 rows), 1-2 ms; unknown VN = no row.
    build: (_codes, vn) => ({
      sql: `SELECT DATEDIFF(o.vstdate, MAX(s.vstdate)) AS days_since,
              COUNT(DISTINCT CASE WHEN s.vstdate >= ${FY_START} THEN s.vn END) AS count_fy
            FROM ovst o
            LEFT JOIN opdscreen s ON s.hn = o.hn AND ${WINDOW("s.vstdate")} AND s.bw > 0 AND s.height > 0
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate`,
      params: [vn],
    }),
  },
  {
    code: "anc_lab",
    label: "แล็บในทะเบียนฝากครรภ์ (ครรภ์ปัจจุบัน)",
    description:
      "แล็บที่บันทึกในทะเบียน ANC (person_anc_lab) ของครรภ์ปัจจุบัน: ลงทะเบียนภายใน 10 เดือน ยังไม่จำหน่าย และยังไม่คลอด (ตาม labor_date / EDC / LMP)",
    param: { label: "รหัสแล็บ ANC (anc_lab_id)", hint: "คั่นด้วยจุลภาค เช่น 2, 4 (VDRL / HIV ครั้งที่ 2)", pattern: /^[0-9]{1,9}$/ },
    columns: [
      { name: "done", label: "บันทึกครบทุกรหัสในครรภ์นี้แล้ว (1/0; ว่าง = ไม่มีครรภ์ปัจจุบัน)", type: "number" },
      { name: "ga_weeks", label: "อายุครรภ์ (สัปดาห์ จาก LMP หรือ EDC; ว่าง = ไม่มีครรภ์ปัจจุบัน/วันที่ผิด)", type: "number" },
    ],
    // done = every listed anc_lab_id is in person_anc_lab of the current pregnancy (ANC_CURRENT) up to the visit.
    // Proven 2026-11-09: o const; ANC_CURRENT subquery person ref ix_hn + person_anc ref ix_person_id, then a const
    // by PRIMARY, person_anc_service ref ix_person_anc_id; person_anc_lab has no index on person_anc_service_id, so it
    // is scanned per service row (2.5k rows in 2026). 2-5 ms on pregnant VNs; unknown VN = no row.
    // Data note (2026): VDRL2/HIV2 (ids 2, 4) are recorded on the same service row as VDRL1/HIV1 in 537 of 539 cases.
    build: (codes, vn) => ({
      sql: `SELECT CASE WHEN a.person_anc_id IS NOT NULL THEN COUNT(DISTINCT l.anc_lab_id) = ${new Set(codes).size} END AS done,
              CASE WHEN ${GA} BETWEEN 0 AND 45 THEN ${GA} END AS ga_weeks
            FROM ovst o
            LEFT JOIN person_anc a ON a.person_anc_id = ${ANC_CURRENT}
            LEFT JOIN (person_anc_service s JOIN person_anc_lab l ON l.person_anc_service_id = s.person_anc_service_id AND l.anc_lab_id IN (${marks(codes.length)}))
              ON s.person_anc_id = a.person_anc_id AND s.anc_service_date <= o.vstdate
            WHERE o.vn = ? GROUP BY o.vn, o.vstdate, a.person_anc_id, a.lmp, a.edc`,
      params: [...codes, vn],
    }),
  },
];

const BY_CODE = new Map(SOURCES.map((s) => [s.code, s]));
export const getSource = (code: string) => BY_CODE.get(code);
