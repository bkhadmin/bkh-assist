-- RLU items per แนวทาง RLU กรมวิทยาศาสตร์การแพทย์ ฉบับปรับปรุงครั้งที่ 3 (2566). Meaning (user decision 2026-11-09):
-- the item warns = "do NOT re-order": the patient is in the target group AND the lab was already ordered within the
-- guideline interval. HBA1C used to warn the opposite way (not tested > 90 days); that moves to opportunity
-- DM.HBA1C_DUE below.
--
-- Our lab_items_code (bkhosxp, checked 2026-11-09 by name / provis_labcode and lab_order use):
--   HbA1c 334 · Creatinine 78, 1055 (1055 unused since 2025-02) · eGFR 921 · Cholesterol 102 · TG 103 · HDL 91 ·
--   LDL 876, 92 (direct LDL) · UACR 377 (Urine Microalbumin), 1038 (Urine Microalbumin/Creatinine, ordered with 377) ·
--   FBS 76, 817 ((N)Glucose(FBS), used until 2025-11) · HBsAg 122 (provis 0746299; 217 = HBsAb, excluded) ·
--   Anti-HCV 219, 430 ((N)Anti-HCV, used until 2025-04). Urine creatinine 242 is ordered with serum Cr, not UACR: excluded.
-- Conditions: diag/lab sources look back 10 years (WINDOW in sources.ts), so "has X" = diag days_since not_empty
-- (OPD diagnosis in 10 years), "no X" = empty, "done within N days" = lab days_since lte N-1 (every order counts,
-- reported or not, the current visit included), "ever" = lab days_since not_empty (= within 10 years).
-- eGFR >= 60 uses lab 921 only (last_value of Cr+eGFR codes together would mix the two tests).
insert into rlu_items (code, label, description, lab_codes, conditions, message, sort_order) values
('HBA1C', 'HbA1c', 'เบาหวาน (E10–E14) ที่ตรวจ HbA1c แล้วภายใน 90 วัน', '{334}',
 '[{"source":"lab","codes":["334"],"column":"days_since","op":"lte","value":"89"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"not_empty"}]',
 'ตรวจ HbA1c แล้วภายใน 90 วัน · แนวทาง RLU: ห่างกันอย่างน้อย 3 เดือน', 10),
('DM_CR', 'Cr/eGFR (DM)', 'เบาหวาน eGFR ล่าสุด ≥ 60 ที่ตรวจ Cr/eGFR แล้วภายใน 1 ปี', '{78,921,1055}',
 '[{"source":"lab","codes":["78","921","1055"],"column":"days_since","op":"lte","value":"364"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"not_empty"},
   {"source":"lab","codes":["921"],"column":"last_value","op":"gte","value":"60"}]',
 'ตรวจ Cr/eGFR แล้วภายใน 1 ปี (eGFR ≥ 60) · แนวทาง RLU: ปีละครั้ง', 20),
('DM_LIPID', 'Lipid (DM)', 'เบาหวานที่ตรวจไขมัน (Chol/TG/HDL/LDL) แล้วภายใน 90 วัน', '{102,103,91,876,92}',
 '[{"source":"lab","codes":["102","103","91","876","92"],"column":"days_since","op":"lte","value":"89"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"not_empty"}]',
 'ตรวจไขมันแล้วภายใน 90 วัน · แนวทาง RLU: ห่างกันอย่างน้อย 3 เดือน', 30),
('DM_UACR', 'UACR (DM)', 'เบาหวานที่ตรวจ UACR/microalbumin แล้วภายใน 90 วัน', '{377,1038}',
 '[{"source":"lab","codes":["377","1038"],"column":"days_since","op":"lte","value":"89"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"not_empty"}]',
 'ตรวจ UACR แล้วภายใน 90 วัน · แนวทาง RLU: ห่างกันอย่างน้อย 3 เดือน', 40),
('HT_CR', 'Cr/eGFR (HT)', 'ความดัน (I10–I15) ไม่เป็นเบาหวาน eGFR ล่าสุด ≥ 60 ที่ตรวจ Cr/eGFR แล้วภายใน 1 ปี', '{78,921,1055}',
 '[{"source":"lab","codes":["78","921","1055"],"column":"days_since","op":"lte","value":"364"},
   {"source":"diag","codes":["I10","I11","I12","I13","I14","I15"],"column":"days_since","op":"not_empty"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"empty"},
   {"source":"lab","codes":["921"],"column":"last_value","op":"gte","value":"60"}]',
 'ตรวจ Cr/eGFR แล้วภายใน 1 ปี (eGFR ≥ 60) · แนวทาง RLU: ปีละครั้ง', 50),
('CU_LIPID', 'Lipid', 'อายุ 20+ ไม่เป็น DM/HT/ไขมันสูง (E78)/CKD (N18) ที่ตรวจไขมันแล้วภายใน 5 ปี', '{102,103,91,876,92}',
 '[{"source":"patient","column":"age_y","op":"gte","value":"20"},
   {"source":"lab","codes":["102","103","91","876","92"],"column":"days_since","op":"lte","value":"1824"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["I10","I11","I12","I13","I14","I15"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["E78"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["N18"],"column":"days_since","op":"empty"}]',
 'ตรวจไขมันแล้วภายใน 5 ปี · แนวทาง RLU: คัดกรองทุก 5 ปี', 60),
('CU_FPG', 'FBS', 'อายุ 35–60 ไม่เป็น DM ไม่มี R73 ที่ตรวจ FBS แล้วภายใน 3 ปี', '{76,817}',
 '[{"source":"patient","column":"age_y","op":"between","value":"35,60"},
   {"source":"lab","codes":["76","817"],"column":"days_since","op":"lte","value":"1094"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["R73"],"column":"days_since","op":"empty"}]',
 'ตรวจ FBS แล้วภายใน 3 ปี · แนวทาง RLU: คัดกรองทุก 3 ปี', 70),
('CU_FPG60', 'FBS (> 60 ปี)', 'อายุมากกว่า 60 ไม่เป็น DM ไม่มี R73 ที่ตรวจ FBS แล้วภายใน 1 ปี', '{76,817}',
 '[{"source":"patient","column":"age_y","op":"gt","value":"60"},
   {"source":"lab","codes":["76","817"],"column":"days_since","op":"lte","value":"364"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["R73"],"column":"days_since","op":"empty"}]',
 'ตรวจ FBS แล้วภายใน 1 ปี · แนวทาง RLU: อายุเกิน 60 ปีละครั้ง', 80),
('CU_CR', 'Cr/eGFR', 'อายุ 35+ ไม่เป็น DM/HT/CKD (N18) ที่ตรวจ Cr/eGFR แล้วภายใน 1 ปี', '{78,921,1055}',
 '[{"source":"patient","column":"age_y","op":"gte","value":"35"},
   {"source":"lab","codes":["78","921","1055"],"column":"days_since","op":"lte","value":"364"},
   {"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["I10","I11","I12","I13","I14","I15"],"column":"days_since","op":"empty"},
   {"source":"diag","codes":["N18"],"column":"days_since","op":"empty"}]',
 'ตรวจ Cr/eGFR แล้วภายใน 1 ปี · แนวทาง RLU: คัดกรองปีละครั้ง', 90),
('CU_HBSAG', 'HBsAg', 'ไม่เป็นไวรัสตับอักเสบบี (B16, B180, B181, Z225) ที่เคยตรวจ HBsAg แล้ว (ใน 10 ปี)', '{122}',
 '[{"source":"lab","codes":["122"],"column":"days_since","op":"not_empty"},
   {"source":"diag","codes":["B16","B180","B181","Z225"],"column":"days_since","op":"empty"}]',
 'เคยตรวจ HBsAg แล้ว · แนวทาง RLU: คัดกรองครั้งเดียวในชีวิต', 100),
('CU_HCV', 'Anti-HCV', 'ไม่เป็นไวรัสตับอักเสบซี (B171, B182) ที่เคยตรวจ Anti-HCV แล้ว (ใน 10 ปี)', '{219,430}',
 '[{"source":"lab","codes":["219","430"],"column":"days_since","op":"not_empty"},
   {"source":"diag","codes":["B171","B182"],"column":"days_since","op":"empty"}]',
 'เคยตรวจ Anti-HCV แล้ว · แนวทาง RLU: คัดกรองครั้งเดียวในชีวิต', 110)
on conflict (code) do update set label = excluded.label, description = excluded.description, lab_codes = excluded.lab_codes,
  conditions = excluded.conditions, message = excluded.message, sort_order = excluded.sort_order, updated_at = now();

-- The old HBA1C meaning (diabetic, HbA1c overdue) as a PP follow-up opportunity, same conditions as before.
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order) values
('DM.HBA1C_DUE', 'PP', 'ติดตามโรคเรื้อรัง', 'ติดตาม HbA1c ครบรอบ (เบาหวาน)',
 'เบาหวาน (E10–E14 ใน 2 ปี) ที่ไม่ได้ตรวจ HbA1c เกิน 90 วัน',
 '[{"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"lte","value":"730"},
   {"source":"lab","codes":["334"],"column":"days_since","op":"gt_or_empty","value":"90"}]', true, 720)
on conflict (code) do nothing;

insert into module_opportunities (module_code, opportunity_code)
select m.code, o.code from modules m cross join opportunities o where o.code = 'DM.HBA1C_DUE'
on conflict do nothing;

-- Manual prices (baht) from the NHSO PP Fee Schedule FY2570 as found in another project's code.
-- UNVERIFIED: finance must check them against the official NHSO announcement before relying on them.
--   PP.COLORECTAL 60 = FIT · PP.TEEN_ANEMIA 65 = Hb/Hct women 13–24 · PP.ANC_LAB 600 = ANC lab set 1 ·
--   PP.ANC_DENTAL 500 · PP.POSTPARTUM 150 per visit · PP.DMHT 40 = FPG screening ·
--   PP.CHILD_IRON 50 = iron syrup for 6–12 months; our opportunity covers 6–60 months, so ages 13–60 months may not pay.
-- Only where no price is set yet (an admin's price wins).
update opportunities o set price = v.price, updated_at = now()
from (values ('PP.COLORECTAL', 60), ('PP.TEEN_ANEMIA', 65), ('PP.ANC_LAB', 600), ('PP.ANC_DENTAL', 500),
             ('PP.POSTPARTUM', 150), ('PP.CHILD_IRON', 50), ('PP.DMHT', 40)) as v(code, price)
where o.code = v.code and o.price is null;
