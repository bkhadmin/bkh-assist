-- Opportunities category "OFC": services worth offering to patients with the Comptroller General's Department
-- right (สิทธิกรมบัญชีกลาง, pttype.hipdata_code = 'OFC'), which reimburses fee-for-service. Shown by the agent's
-- top bar "OFC" button. Generic starting list: an admin edits, adds or switches items off on the admin page.
-- The column patient.hipdata comes from apps/web/src/lib/opportunities/sources.ts.
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order) values
('OFC.CHECKUP', 'OFC', 'สิทธิกรมบัญชีกลาง', 'ตรวจสุขภาพประจำปี (เบิกได้ตามสิทธิข้าราชการ)', 'สิทธิ OFC อายุ 35 ปีขึ้นไป',
 '[{"source":"patient","column":"hipdata","op":"eq","value":"OFC"},{"source":"patient","column":"age_y","op":"gte","value":"35"}]', true, 610),
('OFC.HBA1C', 'OFC', 'สิทธิกรมบัญชีกลาง', 'แล็บติดตามเบาหวาน (HbA1c) ครบรอบ', 'สิทธิ OFC มีการวินิจฉัยเบาหวาน (E10–E14) ใน 2 ปี และไม่ได้ตรวจ HbA1c ใน 90 วัน',
 '[{"source":"patient","column":"hipdata","op":"eq","value":"OFC"},{"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"lte","value":"730"},{"source":"lab","codes":["334"],"column":"days_since","op":"gt_or_empty","value":"90"}]', true, 620),
('OFC.TTM', 'OFC', 'สิทธิกรมบัญชีกลาง', 'แพทย์แผนไทย (นวด ประคบ ยาสมุนไพร)', 'สิทธิ OFC: บริการแพทย์แผนไทยเบิกได้ตามรายการ',
 '[{"source":"patient","column":"hipdata","op":"eq","value":"OFC"}]', true, 630),
('OFC.PT', 'OFC', 'สิทธิกรมบัญชีกลาง', 'กายภาพบำบัด', 'สิทธิ OFC: กายภาพบำบัดเบิกได้ตามรายการ เมื่อมีข้อบ่งชี้',
 '[{"source":"patient","column":"hipdata","op":"eq","value":"OFC"}]', true, 640),
('OFC.DENTAL', 'OFC', 'สิทธิกรมบัญชีกลาง', 'ทันตกรรม (ตรวจฟัน ขูดหินปูน อุดฟัน)', 'สิทธิ OFC: ทันตกรรมเบิกได้ตามรายการ',
 '[{"source":"patient","column":"hipdata","op":"eq","value":"OFC"}]', true, 650);

-- check them on every module that exists now (an admin can untick them per module)
insert into module_opportunities (module_code, opportunity_code)
select m.code, o.code from modules m cross join opportunities o where o.category = 'OFC'
on conflict do nothing;
