-- PPFS / PPB items ported from TopStickly (electron/rules.js PPFS, PPB) into our opportunity model.
--   category 'PP'  = PPFS fee-schedule items (price = NHSO FY2570 fee as listed in TopStickly)
--   category 'PPB' = บริการพื้นฐาน workload items: "ยังไม่บันทึกปีงบนี้" (count_fy = 0), no per-item price
-- PRICES ARE UNVERIFIED: copied from TopStickly's reading of the FY2570 PP fee schedule; finance must check them.
-- Codes are this hospital's HOSxP codes, looked up on bkhosxp 2026-11-09:
--   HBsAg  = LABTEST 0746299 (lab 122)           Anti-HCV = LABTEST 0741699, 0749305 (lab 219, 430)
--   Chol   = LABTEST 0541602 (lab 102)           HDL      = LABTEST 0541202 (lab 91)
--   Hb/Hct = lab 3 (Hb), 744 (Hct), 4 (HCT Centrifuge, no LABTEST code, so the `lab` source)
--   HbA1c  = lab 334                              CXR      = every xray_items name matching CXR/Chest
--   iron/folic (women) = icode 1000131 Ferrous fumarate, 1650047 Triferdine, 1900222 Folic acid, 1000135 Folic (old),
--                        1520208 Obimin-AZ
--   fluoride = tmcode 000168, 000024 (child), 000338, 000273, 000272 (adult codes, still a fluoride varnish/gel)
--   sealant  = tmcode 000293 000300 000294 000301 000296 000297 000298 000299 (permanent molars), 000101 (Sealant)
--   ANC register (anc_lab): 2 = VDRL ครั้งที่ 2, 4 = HIV ครั้งที่ 2; VDRL = lab 111 (RPR), HIV = lab 244
-- History lookups reach back 10 years (sources.ts), so "never" means "not in 10 years".
-- Not seeded:
--   PP.ANC_HUSBAND_THAL: this hospital's anc_lab has no husband DCIP/MCV item (ids 1–10 only; TopStickly's 12/14
--     do not exist here) and the husband's own labs are not linked to the pregnancy.
--   PPB elderly depression 2Q/9Q: same as PP.ELDER_DEPRESSION (age >= 60, 1B0280–1B0285 + 1B0289, count_fy = 0).
-- Conditions are AND-only, so an OR target group is split into items that exclude each other (TB CXR, anemia).
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order, price) values
-- PPFS ปีงบ 2570
('PP.HBSAG_ONCE', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองไวรัสตับอักเสบบี (HBsAg) ครั้งเดียวในชีวิต',
 'เกิดก่อน พ.ศ. 2535 · ไม่มีประวัติวินิจฉัยไวรัสตับอักเสบบี (B16, B18.0, B18.1, Z22.5) · ไม่เคยตรวจ HBsAg',
 '[{"source":"patient","column":"birth_year_be","op":"lt","value":"2535"},
   {"source":"diag","codes":["B16","B180","B181","Z225"],"column":"days_since","op":"empty"},
   {"source":"lab_provis","codes":["0746299"],"column":"days_since","op":"empty"}]', true, 610, 50),
('PP.HCV_ONCE', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองไวรัสตับอักเสบซี (Anti-HCV) ครั้งเดียวในชีวิต',
 'เกิดก่อน พ.ศ. 2535 · ไม่มีประวัติวินิจฉัยไวรัสตับอักเสบซี (B17.1, B18.2) · ไม่เคยตรวจ Anti-HCV',
 '[{"source":"patient","column":"birth_year_be","op":"lt","value":"2535"},
   {"source":"diag","codes":["B171","B182"],"column":"days_since","op":"empty"},
   {"source":"lab_provis","codes":["0741699","0749305"],"column":"days_since","op":"empty"}]', true, 620, 50),
('PP.LIPID_SCREEN', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองไขมันในเลือด (Total cholesterol + HDL)',
 'อายุ 45–70 ปี · ไม่มีประวัติไขมันในเลือดสูง (E78) · ไม่ได้ตรวจ Cholesterol/HDL ใน 5 ปี',
 '[{"source":"patient","column":"age_y","op":"between","value":"45,70"},
   {"source":"diag","codes":["E78"],"column":"days_since","op":"empty"},
   {"source":"lab_provis","codes":["0541602","0541202"],"column":"days_since","op":"gt_or_empty","value":"1825"}]', true, 630, 160),
('PP.TB_CXR_CKD_HIV', 'PP', 'PPFS ปีงบ 2570', 'เอกซเรย์ปอดคัดกรองวัณโรค (กลุ่มเสี่ยง CKD / HIV)',
 'มีประวัติไตเรื้อรัง (N18) หรือ HIV (B20–B24, Z21) · ไม่ได้เอกซเรย์ทรวงอกใน 1 ปี',
 '[{"source":"diag","codes":["N18","B20","B21","B22","B23","B24","Z21"],"column":"days_since","op":"not_empty"},
   {"source":"xray","codes":["7","52","83","93","94","95","108","109","128","129","137","150","154","157","236","256","260"],"column":"days_since","op":"gt_or_empty","value":"365"}]', true, 640, 100),
('PP.TB_CXR_ELDER', 'PP', 'PPFS ปีงบ 2570', 'เอกซเรย์ปอดคัดกรองวัณโรค (อายุ 65+ ที่เป็นเบาหวาน/COPD)',
 'อายุ 65 ปีขึ้นไป · มีประวัติเบาหวาน (E10–E14) หรือ COPD (J44) · ไม่มี CKD/HIV (อยู่ในรายการ CKD/HIV แล้ว) · ไม่ได้เอกซเรย์ทรวงอกใน 1 ปี',
 '[{"source":"patient","column":"age_y","op":"gte","value":"65"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14","J44"],"column":"days_since","op":"not_empty"},
   {"source":"diag","codes":["N18","B20","B21","B22","B23","B24","Z21"],"column":"days_since","op":"empty"},
   {"source":"xray","codes":["7","52","83","93","94","95","108","109","128","129","137","150","154","157","236","256","260"],"column":"days_since","op":"gt_or_empty","value":"365"}]', true, 641, 100),
('PP.TB_CXR_DM', 'PP', 'PPFS ปีงบ 2570', 'เอกซเรย์ปอดคัดกรองวัณโรค (เบาหวานคุมไม่ได้ HbA1c ≥ 7)',
 'อายุต่ำกว่า 65 ปี (65+ อยู่ในรายการอายุ 65+) · มีประวัติเบาหวาน (E10–E14) · HbA1c ล่าสุด ≥ 7 และตรวจใน 1 ปี · ไม่มี CKD/HIV · ไม่ได้เอกซเรย์ทรวงอกใน 1 ปี',
 '[{"source":"patient","column":"age_y","op":"lt","value":"65"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"not_empty"},
   {"source":"lab","codes":["334"],"column":"days_since","op":"lte","value":"365"},
   {"source":"lab","codes":["334"],"column":"last_value","op":"gte","value":"7"},
   {"source":"diag","codes":["N18","B20","B21","B22","B23","B24","Z21"],"column":"days_since","op":"empty"},
   {"source":"xray","codes":["7","52","83","93","94","95","108","109","128","129","137","150","154","157","236","256","260"],"column":"days_since","op":"gt_or_empty","value":"365"}]', true, 642, 100),
('PP.IRON_FOLIC_WOMEN', 'PP', 'PPFS ปีงบ 2570', 'ยาเม็ดเสริมธาตุเหล็กและโฟลิก (หญิง 13–45 ปี)',
 'หญิงอายุ 13–45 ปี · ไม่ได้ตั้งครรภ์ (ไม่มี Z32.1/Z33/Z34/Z35 ใน 300 วัน และไม่อยู่ในทะเบียนฝากครรภ์) · ไม่ได้รับ Ferrous/Triferdine/Folic/Obimin ใน 1 ปี',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},
   {"source":"patient","column":"age_y","op":"between","value":"13,45"},
   {"source":"diag","codes":["Z321","Z33","Z34","Z35"],"column":"days_since","op":"gt_or_empty","value":"300"},
   {"source":"anc","column":"pregnant","op":"eq","value":"0"},
   {"source":"drug","codes":["1000131","1650047","1900222","1000135","1520208"],"column":"days_since","op":"gt_or_empty","value":"365"}]', true, 650, 80),
('PP.ANEMIA_INFANT', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองโลหิตจาง (Hb/Hct) เด็ก 6–12 เดือน',
 'อายุ 6–12 เดือน · ไม่เคยตรวจ Hb/Hct',
 '[{"source":"patient","column":"age_m","op":"between","value":"6,12"},
   {"source":"lab","codes":["3","744","4"],"column":"age_m_last","op":"empty"}]', true, 660, 30),
('PP.ANEMIA_INFANT_REDO', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองโลหิตจาง (Hb/Hct) เด็ก 6–12 เดือน',
 'อายุ 6–12 เดือน · ตรวจ Hb/Hct ครั้งล่าสุดก่อนอายุ 6 เดือน (ยังไม่ได้ตรวจในช่วงอายุนี้)',
 '[{"source":"patient","column":"age_m","op":"between","value":"6,12"},
   {"source":"lab","codes":["3","744","4"],"column":"age_m_last","op":"lt","value":"6"}]', true, 661, 30),
('PP.ANEMIA_CHILD', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองโลหิตจาง (Hb/Hct) เด็ก 3–5 ปี',
 'อายุ 3–5 ปี · ไม่เคยตรวจ Hb/Hct',
 '[{"source":"patient","column":"age_y","op":"between","value":"3,5"},
   {"source":"lab","codes":["3","744","4"],"column":"age_m_last","op":"empty"}]', true, 670, 30),
('PP.ANEMIA_CHILD_REDO', 'PP', 'PPFS ปีงบ 2570', 'คัดกรองโลหิตจาง (Hb/Hct) เด็ก 3–5 ปี',
 'อายุ 3–5 ปี · ตรวจ Hb/Hct ครั้งล่าสุดก่อนอายุ 3 ปี (ยังไม่ได้ตรวจในช่วงอายุนี้)',
 '[{"source":"patient","column":"age_y","op":"between","value":"3,5"},
   {"source":"lab","codes":["3","744","4"],"column":"age_m_last","op":"lt","value":"36"}]', true, 671, 30),
-- หญิงตั้งครรภ์: lab set 2. The ANC register alone is not enough here (most pregnancies have no person_anc_lab rows),
-- so a VDRL (RPR) or Anti-HIV order in the last 8 weeks (at GA >= 28 that is GA >= 20) also counts as done.
('PP.ANC_LAB2', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ตรวจเลือดหญิงตั้งครรภ์ชุดที่ 2 (VDRL, HIV) อายุครรภ์ 28 สัปดาห์ขึ้นไป',
 'ครรภ์ปัจจุบัน GA ≥ 28 สัปดาห์ · ทะเบียน ANC ยังไม่มี VDRL/HIV ครั้งที่ 2 · ไม่ได้สั่ง RPR/Anti-HIV ใน 8 สัปดาห์',
 '[{"source":"anc_lab","codes":["2","4"],"column":"ga_weeks","op":"gte","value":"28"},
   {"source":"anc_lab","codes":["2","4"],"column":"done","op":"eq","value":"0"},
   {"source":"lab","codes":["111","244"],"column":"days_since","op":"gt_or_empty","value":"56"}]', true, 175, 190),
-- PPB บริการพื้นฐาน: once per fiscal year
('PPB.DSPM', 'PPB', 'PPB บริการพื้นฐาน (ผลงานปีงบ)', 'ตรวจพัฒนาการเด็ก (DSPM) ยังไม่บันทึกปีงบนี้',
 'อายุ 0–5 ปี · ยังไม่มีรหัส 1B260–1B262 ในปีงบประมาณนี้ · ไม่รวมอายุ 9, 18, 30, 42, 60 เดือน (อยู่ในรายการ PP.DSPM)',
 '[{"source":"patient","column":"age_y","op":"between","value":"0,5"},
   {"source":"patient","column":"age_m","op":"not_in","value":"9,18,30,42,60"},
   {"source":"pp_special","codes":["1B260","1B261","1B262"],"column":"count_fy","op":"eq","value":"0"}]', true, 810, null),
('PPB.GROWTH', 'PPB', 'PPB บริการพื้นฐาน (ผลงานปีงบ)', 'ชั่งน้ำหนัก-วัดส่วนสูงเด็ก ยังไม่บันทึกปีงบนี้',
 'อายุ 6–12 ปี · ยังไม่มีการบันทึกทั้งน้ำหนักและส่วนสูงในหน้าซักประวัติในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"6,12"},
   {"source":"growth","column":"count_fy","op":"eq","value":"0"}]', true, 820, null),
('PPB.FLUORIDE', 'PPB', 'PPB บริการพื้นฐาน (ผลงานปีงบ)', 'เคลือบฟลูออไรด์ ยังไม่บันทึกปีงบนี้',
 'อายุ 4–12 ปี · ยังไม่มีหัตถการเคลือบฟลูออไรด์ในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"4,12"},
   {"source":"dental","codes":["000168","000024","000338","000273","000272"],"column":"count_fy","op":"eq","value":"0"}]', true, 830, null),
('PPB.SEALANT', 'PPB', 'PPB บริการพื้นฐาน (ผลงานปีงบ)', 'เคลือบหลุมร่องฟันแท้ ยังไม่บันทึกปีงบนี้',
 'อายุ 6–12 ปี · ยังไม่มีหัตถการเคลือบหลุมร่องฟันแท้ในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"6,12"},
   {"source":"dental","codes":["000293","000300","000294","000301","000296","000297","000298","000299","000101"],"column":"count_fy","op":"eq","value":"0"}]', true, 840, null)
on conflict (code) do nothing;

-- check them on every module that exists now (an admin can untick them per module)
insert into module_opportunities (module_code, opportunity_code)
select m.code, o.code from modules m cross join opportunities o
 where o.code in ('PP.HBSAG_ONCE', 'PP.HCV_ONCE', 'PP.LIPID_SCREEN', 'PP.TB_CXR_CKD_HIV', 'PP.TB_CXR_ELDER', 'PP.TB_CXR_DM',
                  'PP.IRON_FOLIC_WOMEN', 'PP.ANEMIA_INFANT', 'PP.ANEMIA_INFANT_REDO', 'PP.ANEMIA_CHILD', 'PP.ANEMIA_CHILD_REDO',
                  'PP.ANC_LAB2', 'PPB.DSPM', 'PPB.GROWTH', 'PPB.FLUORIDE', 'PPB.SEALANT')
on conflict do nothing;
