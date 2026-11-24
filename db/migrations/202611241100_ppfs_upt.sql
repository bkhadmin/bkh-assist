-- PPFS: บริการทดสอบการตั้งครรภ์, a claim reminder: the visit has a urine pregnancy test order (lab 67 "Pregnancy Test
-- (UPT)" on bkhosxp; lab days_since = 0: ordered on the visit date) but not yet the service charge item icode 3002426
-- "ค่าบริการทดสอบการตั้งครรภ์ (4-ANC-PRT : Preg test)" (75 บาท, opitemrece). Once the item is charged it disappears.
-- 2026-11-24: ~1,000 UPT orders a year, the item charged 3 times. The claim also needs Z32.0/Z32.1 (save-check rule
-- Doctorcheck.UPT_Z32). Price = the icode's HOSxP price (no manual price).
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order, price, icodes) values
('PP.UPT', 'PP', 'PPFS ปีงบ 2570', 'ค่าบริการทดสอบการตั้งครรภ์ (4-ANC-PRT) ยังไม่ได้คิด',
 'visit นี้สั่ง Pregnancy Test (UPT) แต่ยังไม่มีรายการค่าบริการทดสอบการตั้งครรภ์ (icode 3002426) · คิดรายการนี้และลงรหัส Z32.0 หรือ Z32.1 เพื่อเบิก',
 '[{"source":"lab","codes":["67"],"column":"days_since","op":"eq","value":"0"},
   {"source":"drug","codes":["3002426"],"column":"days_since","op":"gt_or_empty","value":"0"}]', true, 655, null, '{3002426}')
on conflict (code) do nothing;

-- check it on every module that exists now (an admin can untick it per module)
insert into module_opportunities (module_code, opportunity_code)
select m.code, 'PP.UPT' from modules m
on conflict do nothing;
