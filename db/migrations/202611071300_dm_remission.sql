-- NHSO "DM remission" payments (type 2 diabetes in remission), shown in the agent's "งาน PP" badge with the lump sum.
--   first payment 4,000 baht: HbA1c < 6.5% on 2 consecutive reported results at least 3 months apart
--   follow-up 2,000 baht:     a further result < 6.5%, 3–6 months after the previous one
-- Patients: ICD-10 E11 (type 2), age >= 18. HbA1c = lab_items_code 334. The lab columns prev_value / prev2_value /
-- days_last_prev / days_prev_prev2 come from apps/web/src/lib/opportunities/sources.ts.
-- Not checked (no data in HOSxP for it): "after stopping glucose-lowering drugs OR lifestyle change" (either one
-- qualifies) and whether the first payment was already claimed. The first item therefore requires the result
-- before the two lows NOT to be low too (prev2_value empty or >= 6.5), so a patient moves from the 4,000 item to
-- the 2,000 one instead of matching both. An admin edits thresholds on the admin page.
-- The latest result must be within a year (lab days_since <= 365) so old remissions do not alert forever.
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order, price) values
('DM.REMISSION', 'PP', 'เบาหวานระยะสงบ (DM Remission)', 'เบาหวานระยะสงบ: เบิกครั้งแรก',
 'E11 อายุ 18+ · HbA1c < 6.5% สองครั้งติดกัน ห่างกันอย่างน้อย 90 วัน (ครั้งก่อนหน้านั้นยังไม่ต่ำกว่า 6.5%) · ผลล่าสุดภายใน 1 ปี',
 '[{"source":"patient","column":"age_y","op":"gte","value":"18"},
   {"source":"diag","codes":["E11"],"column":"days_since","op":"lte","value":"730"},
   {"source":"lab","codes":["334"],"column":"days_since","op":"lte","value":"365"},
   {"source":"lab","codes":["334"],"column":"last_value","op":"lt","value":"6.5"},
   {"source":"lab","codes":["334"],"column":"prev_value","op":"lt","value":"6.5"},
   {"source":"lab","codes":["334"],"column":"days_last_prev","op":"gte","value":"90"},
   {"source":"lab","codes":["334"],"column":"prev2_value","op":"gt_or_empty","value":"6.49"}]', true, 700, 4000),
('DM.REMISSION_FOLLOW', 'PP', 'เบาหวานระยะสงบ (DM Remission)', 'เบาหวานระยะสงบ: เบิกเพิ่ม (ติดตาม)',
 'E11 อายุ 18+ · HbA1c < 6.5% สามครั้งติดกัน ครั้งล่าสุดห่างจากครั้งก่อน 90–183 วัน · ผลล่าสุดภายใน 1 ปี',
 '[{"source":"patient","column":"age_y","op":"gte","value":"18"},
   {"source":"diag","codes":["E11"],"column":"days_since","op":"lte","value":"730"},
   {"source":"lab","codes":["334"],"column":"days_since","op":"lte","value":"365"},
   {"source":"lab","codes":["334"],"column":"last_value","op":"lt","value":"6.5"},
   {"source":"lab","codes":["334"],"column":"prev_value","op":"lt","value":"6.5"},
   {"source":"lab","codes":["334"],"column":"prev2_value","op":"lt","value":"6.5"},
   {"source":"lab","codes":["334"],"column":"days_last_prev","op":"between","value":"90,183"},
   {"source":"lab","codes":["334"],"column":"days_prev_prev2","op":"gte","value":"90"}]', true, 710, 2000)
on conflict (code) do nothing;

-- check them on every module that exists now (an admin can untick them per module)
insert into module_opportunities (module_code, opportunity_code)
select m.code, o.code from modules m cross join opportunities o where o.code in ('DM.REMISSION', 'DM.REMISSION_FOLLOW')
on conflict do nothing;
