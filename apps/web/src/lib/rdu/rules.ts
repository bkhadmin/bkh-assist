/**
 * RDU (Rational Drug Use) rules: the per-visit indicators of Service Plan สาขา RDU, ported from TopStickly
 * (electron/rules.js). Each rule's SQL is written with :hn / :vn / :icode for readability (shown on /admin/rdu);
 * `bind` turns them into `?` params for hisQuery. Any row returned = the rule is hit. Drug rules return the drug
 * columns of `drugsIn`, the asthma rule returns `dx`.
 *
 * Proven on bkhosxp (MariaDB 10.11.13) 2026-11-09, see the report in the commit / route doc. Pure module (no
 * server-only import) so node:test can load it.
 */

export type RduRule = { code: string; label: string; criteria: string; sql: string };

// The visit's items: what is saved in opitemrece, plus :icode = the drug in HOSxP's drug-name box but not saved
// yet ('' = none, joins nothing), so the same SQL serves the saved visit and a pre-save check.
const ITEMS = `(SELECT icode, qty, drugusage, item_no, 0 AS pending FROM opitemrece WHERE vn = :vn
         UNION ALL SELECT :icode, NULL, NULL, 999999, 1)`;

/** Drugs of this visit matching `match`, filtered by extra `AND ...` conditions. */
const drugsIn = (match: string, ...where: string[]) => `
SELECT d.name, d.strength, o.qty, d.units,
       TRIM(CONCAT_WS(' ', du.name1, du.name2, du.name3)) AS howto, o.pending
  FROM ${ITEMS} o
  JOIN drugitems d ON d.icode = o.icode
  LEFT JOIN drugusage du ON du.drugusage = o.drugusage
 WHERE ${match}${where.map((w) => `
   AND ${w}`).join("")}
 ORDER BY o.item_no, d.name`;

// Names here are often split for look-alike safety ("Diclo-FENAC", "C_efo_taxime") but generic_name is clean,
// so match both. REGEXP is case-insensitive on these tis620_thai_ci columns.
const drug = (re: string, t = "d") => `CONCAT_WS(' ', ${t}.name, ${t}.generic_name) REGEXP '${re}'`;
// Eye/ear drops, creams, gels, nasal sprays. dosageform is often empty (e.g. "DICLOFENAC EYE DROP"), so the name too.
const systemic = (t = "d") =>
  `CONCAT_WS(' ', ${t}.name, ${t}.dosageform) NOT REGEXP 'cream|crm|ointment|eye|ear|drop|gel|lotion|topical|oph|otic|emulsion|nasal|spray'`;
const visitDx = (re: string) => `EXISTS (SELECT 1 FROM ovstdiag WHERE vn = :vn AND icd10 REGEXP '${re}')`;
const visitDrug = (where: string) => `EXISTS (SELECT 1 FROM ${ITEMS} o2 JOIN drugitems d2 ON d2.icode = o2.icode
                WHERE ${where})`;
// Ever diagnosed: an OPD diagnosis in the last 10 years (same window as opportunities) or a clinic registration
// whose clinic.icd10 matches (here e.g. 001 = E119, 002 = I10, 009 = J459). icd10 is stored without the dot.
const dx = (re: string) => `(EXISTS (SELECT 1 FROM ovstdiag WHERE hn = :hn AND vstdate >= CURDATE() - INTERVAL 10 YEAR AND icd10 REGEXP '${re}')
        OR EXISTS (SELECT 1 FROM clinicmember cm JOIN clinic c ON c.clinic = cm.clinic
                    WHERE cm.hn = :hn AND c.icd10 REGEXP '${re}'))`;
const age = (cond: string) => `(SELECT TIMESTAMPDIFF(YEAR, birthday, CURDATE()) FROM patient WHERE hn = :hn) ${cond}`;
// Latest reported eGFR (lab_items_code 921 "eGFR", provis 0581904) within `days` as a number. NULL when none or
// not a number, never 0, so it cannot trip a "<= 30". A bound counts as its value ('>90' → 90).
const gfr = (days: number) => `(SELECT CASE WHEN t.r REGEXP '^ *[0-9]' THEN t.r + 0 END FROM (
          SELECT REPLACE(REPLACE(REPLACE(lo.lab_order_result, '>', ''), '<', ''), '=', '') AS r FROM lab_head h
            JOIN lab_order lo ON lo.lab_order_number = h.lab_order_number AND lo.lab_items_code = 921
           WHERE h.hn = :hn AND h.confirm_report = 'Y' AND TRIM(lo.lab_order_result) <> ''
             AND h.order_date > CURDATE() - INTERVAL ${days} DAY
           ORDER BY h.order_date DESC, h.order_time DESC LIMIT 1) t)`;

// Systemic antibiotics (ATC J01). The antibiotic flag is incomplete here (Cefdinir, Streptomycin = 'N'), so also
// match names. CEF/CEPH only at a word start ("Poultice for" contains "cefor"). Not J01: metronidazole/tinidazole
// (P01AB) and anti-TB drugs (J04, flagged 'Y' here).
const ABX = `(d.antibiotic = 'Y' OR ${drug("(^|[^A-Z])CE(F|PH)|CILLIN|MYCIN|MICIN|CYCLINE|FLOXACIN|TRIMOXAZOLE|SULFAMETH|TRIMETHOPRIM|NITROFURANTOIN|FOSFOMYCIN|PENEM|CLAVULAN|LINEZOLID|COLISTIN")})
   AND NOT ${drug("METRONIDAZOLE|TINIDAZOLE|ETHAMBUTOL|ISONIAZID|RIFAMPICIN|RIFAPENTINE|PYRAZINAMIDE")}
   AND ${systemic()}`;
// HOSxP has no NSAID flag and therapeuticgroup is unreliable, so generic names. Low-dose aspirin left out on purpose.
const NSAIDS = [
  "IBUPROFEN", "DEXIBUPROFEN", "DICLOFENAC", "ACECLOFENAC", "NAPROXEN", "KETOPROFEN", "DEXKETOPROFEN",
  "FLURBIPROFEN", "KETOROLAC", "INDOMETHACIN", "SULINDAC", "ETODOLAC", "NABUMETONE", "MEFENAMIC",
  "TOLFENAMIC", "FLUFENAMIC", "FLOCTAFENINE", "PIROXICAM", "MELOXICAM", "TENOXICAM", "LORNOXICAM", "NIMESULIDE",
  "CELECOXIB", "ETORICOXIB", "PARECOXIB", "PHENYLBUTAZONE",
].join("|");
const NSAID = `${drug(NSAIDS)} AND ${systemic()}`;
// ICD-10 sets from คำชี้แจงตัวชี้วัด Service Plan สาขา RDU (สป.สธ. ปรับปรุง 20 ธ.ค. 2559)
const URI = "^(J00|J01[0-489]|J02[09]|J03[089]|J04[0-2]|J05[01]|J06[089]|J101|J111|J20[0-9]|J21[089]|H65[019]|H66[049]|H67[018]|H72[0-289])$";
const AD = "^(A00[019]|A020|A03[0-389]|A04[0-9]|A05[0349]|A08[0-5]|A09[09]?|K52[189])$";
const FTW = "^(S0[01]|S05|S0[7-9]|S1[01]|S1[6-9]|S2[01]|S2[89]|S3[01]|S3[89]|S4[01]|S4[6-9]|S5[01]|S5[6-9]|S6[01]|S6[6-9]|S7[01]|S7[6-9]|S8[01]|S8[6-9]|S9[01]|S9[6-9]|T0[01]|T0[4-7]|T09[01]|T11[01]|T13[01]|T14[0-16-9]|T2[0-5]|T29|T3[0-2]|W5[0-9]|W6[0-4]|X[0-3][0-9])";
const PREG = "^(Z321|Z33|Z34|Z35)";
const SEDATING_FREE = "CETIRIZINE|DESLORATADINE|FEXOFENADINE|LORATADINE";
// warfarin, statins (not "STATIN": nystatin), ergots
const PREG_X = "WARFARIN|ATORVASTATIN|SIMVASTATIN|ROSUVASTATIN|PRAVASTATIN|LOVASTATIN|FLUVASTATIN|PITAVASTATIN|ERGOTAMINE|ERGOMETRINE|ERGONOVINE";
const ICS = "BUDESONIDE|FLUTICASONE|BECLOMETASONE|BECLOMETHASONE|CICLESONIDE|MOMETASONE";

export const RDU_RULES: RduRule[] = [
  {
    code: "RDU.URI_ABX",
    label: "URI/หลอดลมอักเสบเฉียบพลัน ได้ยาปฏิชีวนะ",
    criteria: "Dx visit นี้อยู่ในชุด URI 50 รหัส (J00–J06, J10.1, J11.1, J20–J21, H65–H67, H72) และได้ยาปฏิชีวนะ (J01) (เป้าหมาย ≤ 20–30%)",
    sql: drugsIn(ABX, visitDx(URI)),
  },
  {
    code: "RDU.AD_ABX",
    label: "อุจจาระร่วงเฉียบพลัน ได้ยาปฏิชีวนะ",
    criteria: "Dx visit นี้ A00–A09, K52.1/8/9 (อุจจาระร่วงเฉียบพลัน) และได้ยาปฏิชีวนะ (J01) (เป้าหมาย ≤ 20%)",
    sql: drugsIn(ABX, visitDx(AD)),
  },
  {
    code: "RDU.FTW_ABX",
    label: "แผลสดจากอุบัติเหตุ ได้ยาปฏิชีวนะ",
    criteria: "Dx visit นี้ S/T/W/X ตามชุด FTW (แผลสดภายใน 6 ชม.) และได้ยาปฏิชีวนะ (J01) กินหรือฉีด (เป้าหมาย ≤ 40–50%)",
    sql: drugsIn(ABX, visitDx(FTW)),
  },
  {
    code: "RDU.RAS_DUAL",
    label: "HT ได้ RAS blockade 2 ชนิดร่วมกัน",
    criteria: "Dx visit นี้ I10 และได้ยา 2 กลุ่มขึ้นไปใน ACEI (-pril), ARB (-sartan), aliskiren (เป้าหมาย 0%)",
    sql: drugsIn(
      drug("PRIL|SARTAN|ALISKIREN"),
      visitDx("^I10"),
      `(${["PRIL", "SARTAN", "ALISKIREN"].map((g) => `IF(${visitDrug(drug(g, "d2"))}, 1, 0)`).join(" + ")}) >= 2`,
    ),
  },
  {
    code: "RDU.CKD_NSAID",
    label: "CKD ระยะ 3 ขึ้นไป ได้ NSAIDs",
    criteria: "เคยวินิจฉัย N18.3, N18.4, N18.5, N18.9 (ใน 10 ปีหรือขึ้นทะเบียนคลินิก) และ visit นี้ได้ NSAIDs กินหรือฉีด (ไม่นับ aspirin) (เป้าหมาย ≤ 10%)",
    sql: drugsIn(NSAID, dx("^N18[3459]")),
  },
  {
    code: "RDU.NSAID_DUP",
    label: "ได้ NSAIDs ซ้ำซ้อน ≥ 2 ชนิด",
    criteria: "visit นี้ได้ NSAIDs กินหรือฉีด ตั้งแต่ 2 ชนิดขึ้นไป (ไม่นับ aspirin) (เป้าหมาย ≤ 5%)",
    // "ชนิด" = distinct generic_name
    sql: drugsIn(NSAID, `(SELECT COUNT(DISTINCT d2.generic_name) FROM ${ITEMS} o2 JOIN drugitems d2 ON d2.icode = o2.icode
                WHERE ${drug(NSAIDS, "d2")} AND ${systemic("d2")}) >= 2`),
  },
  {
    code: "RDU.DM_METFORMIN",
    label: "DM ได้ metformin ทั้งที่มีข้อห้ามใช้",
    criteria: "เบาหวาน E11 ได้ metformin (รวมยาผสม) และ eGFR ล่าสุดใน 6 เดือน ≤ 30 หรือเคยวินิจฉัย N18.4/N18.5",
    sql: drugsIn(drug("METFORMIN"), dx("^E11"), `(${dx("^N18[45]")} OR ${gfr(180)} <= 30)`),
  },
  {
    code: "RDU.DM_GLIB",
    label: "DM ได้ glibenclamide ในผู้สูงอายุ/ไตเสื่อม",
    criteria: "เบาหวาน E11 ได้ glibenclamide และ อายุ > 65 ปี หรือ eGFR ล่าสุดใน 6 เดือน < 60 (เป้าหมาย ≤ 5%)",
    sql: drugsIn(drug("GLIBENCLAMIDE|GLYBURIDE"), dx("^E11"), `(${age("> 65")} OR ${gfr(180)} < 60)`),
  },
  {
    code: "RDU.ELDER_BZD",
    label: "ผู้สูงอายุได้ benzodiazepine ออกฤทธิ์ยาว",
    criteria: "อายุ ≥ 65 ปี ได้ chlordiazepoxide, diazepam, clorazepate ชนิดกิน (เป้าหมาย ≤ 5%)",
    sql: drugsIn(drug("CHLORDIAZEPOXIDE|DIAZEPAM|CLORAZEPATE"), age(">= 65"), `CONCAT_WS(' ', d.name, d.dosageform) NOT REGEXP 'inj'`),
  },
  {
    code: "RDU.CHILD_ANTIHIST",
    label: "เด็ก URI ได้ antihistamine ชนิดไม่ง่วง",
    criteria: "อายุ ≤ 12 ปี Dx visit นี้อยู่ในชุด URI และได้ cetirizine, levocetirizine, desloratadine, fexofenadine, loratadine (เป้าหมาย ≤ 20%)",
    sql: drugsIn(drug(SEDATING_FREE), age("<= 12"), visitDx(URI)),
  },
  {
    code: "RDU.PREG_X",
    label: "ตั้งครรภ์ได้ยาที่ห้ามใช้",
    criteria: "Dx visit นี้ Z32.1, Z33, Z34, Z35 (ตั้งครรภ์) และได้ warfarin, statins, ergots (ยกเว้น warfarin ใน mechanical heart valve Z95.2) (เป้าหมาย 0 ราย)",
    sql: drugsIn(drug(PREG_X), visitDx(PREG), `NOT (${drug("WARFARIN")} AND ${dx("^Z952")})`),
  },
  {
    code: "RDU.ASTHMA_ICS",
    label: "หืดไม่ได้ inhaled corticosteroid",
    criteria: "Dx visit นี้ J45/J46 (หืด) และไม่ได้ ICS (budesonide, fluticasone, beclometasone, ciclesonide, mometasone; ไม่นับพ่นจมูก) ใน visit นี้ (เป้าหมาย ≥ 80% ได้ ICS)",
    sql: `
SELECT icd10 AS dx FROM ovstdiag
 WHERE vn = :vn AND icd10 REGEXP '^J4[56]'
   AND NOT ${visitDrug(`${drug(ICS, "d2")} AND CONCAT_WS(' ', d2.name, d2.generic_name) NOT REGEXP 'nasal'`)}`,
  },
];

/** :hn / :vn / :icode → `?` with params in order (hisQuery takes `?` only). */
export function bind(sql: string, p: { hn: string; vn: string; icode: string }): { sql: string; params: string[] } {
  const params: string[] = [];
  const out = sql.replace(/:(hn|vn|icode)\b/g, (_, k: keyof typeof p) => (params.push(p[k]), "?"));
  return { sql: out, params };
}

/** Text from HOSxP's drug box → the form the lookup compares: trimmed, runs of spaces collapsed, max 200 chars. */
export const normalizeDrugText = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * The drug in HOSxP's drug-name box: "<name> <strength> <units>" as HOSxP fills it after a pick, or the name alone.
 * Both sides with spaces collapsed (names here have double spaces, e.g. "AMOXYCILLIN  CAP"). Longest name wins.
 * Full scan of drugitems (~1,900 rows), a few ms.
 */
export const PENDING_DRUG = `SELECT icode, name FROM drugitems
 WHERE istatus = 'Y'
   AND ? IN (REGEXP_REPLACE(TRIM(CONCAT_WS(' ', name, strength, units)), ' +', ' '), REGEXP_REPLACE(TRIM(name), ' +', ' '))
 ORDER BY CHAR_LENGTH(name) DESC LIMIT 1`;
