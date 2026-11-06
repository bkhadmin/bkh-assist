-- Add-on "opportunities" (โอกาสเพิ่มรายได้): hints shown at the point of care when a visit qualifies for a
-- billable service (first category: PP). Separate from validation rules: they never make a check "missing".
--
-- An opportunity is a list of conditions (AND) an admin builds on the admin page. Each condition reads one column
-- of a data source defined in code (apps/web/src/lib/opportunities/sources.ts, SQL proven on HIS), optionally
-- with a list of codes bound as SQL params. The admin never writes SQL, so the rule from the init migration holds.
--   condition = {"source": "pp_special", "codes": ["1B30"], "column": "days_since", "op": "gt_or_empty", "value": "1825"}

alter table modules add column opportunities_enabled boolean not null default false;

create table opportunities (
  code text primary key,                          -- e.g. 'PP.CERVICAL'
  category text not null,                         -- e.g. 'PP'; new kinds of add-on get a new category
  group_name text,                                -- sub-group for the admin list, e.g. 'ผู้สูงอายุ 60 ปีขึ้นไป'
  label text not null,                            -- message shown to staff
  description text,
  conditions jsonb not null default '[]'::jsonb,  -- [{source, codes?, column, op, value?}], all must match
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which opportunities each module checks (only used while modules.opportunities_enabled is on).
create table module_opportunities (
  module_code text not null references modules(code) on update cascade on delete cascade,
  opportunity_code text not null references opportunities(code) on update cascade on delete cascade,
  primary key (module_code, opportunity_code)
);

-- Codes of the opportunities matched by each check (for statistics: how many PP chances were shown).
alter table check_logs add column opportunities jsonb not null default '[]'::jsonb;

-- Seed: PP benefits by age group. Codes (lab_items_code, icode, vaccine export codes) are this hospital's
-- HOSxP codes as of 2026-11-06. Items marked inactive have no reliable HIS data yet: fix their conditions first.
insert into opportunities (code, category, group_name, label, description, conditions, is_active, sort_order) values
-- หญิงตั้งครรภ์และหลังคลอด
('PP.ANC', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ฝากครรภ์คุณภาพ', 'ตั้งครรภ์และไม่ได้ฝากครรภ์มาแล้ว 4 สัปดาห์ขึ้นไป',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"anc","column":"days_since_anc","op":"gt_or_empty","value":"27"}]', true, 110),
('PP.ANC_LAB', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ตรวจเลือดคัดกรองหญิงตั้งครรภ์ (โลหิตจาง ธาลัสซีเมีย HIV ซิฟิลิส ตับอักเสบบี)', 'ตั้งครรภ์และยังไม่มีแล็บ Hct/DCIP/Hb typing/Anti-HIV/RPR/HBsAg ใน 280 วัน',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"lab","codes":["744","4","73","75","244","111","122"],"column":"days_since","op":"gt_or_empty","value":"280"}]', true, 120),
('PP.ANC_US', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'อัลตราซาวด์หญิงตั้งครรภ์', 'ตั้งครรภ์และยังไม่มีบันทึกอัลตราซาวด์ในครรภ์นี้',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"anc","column":"ultrasound_count","op":"eq","value":"0"}]', true, 130),
('PP.ANC_DENTAL', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ตรวจสุขภาพช่องปากหญิงตั้งครรภ์', 'ตั้งครรภ์และยังไม่มีวันที่ตรวจ/รักษาช่องปากในทะเบียนฝากครรภ์',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"anc","column":"dental_done","op":"eq","value":"0"}]', true, 140),
('PP.ANC_SUPP', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ยาเสริมธาตุเหล็ก โฟลิก ไอโอดีน', 'ตั้งครรภ์และไม่ได้รับ Triferdine/Ferrous/Folic ใน 30 วัน',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"drug","codes":["1650047","1000131","1000135"],"column":"days_since","op":"gt_or_empty","value":"30"}]', true, 150),
('PP.ANC_VACCINE', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'วัคซีนหญิงตั้งครรภ์ (dT/aP)', 'ตั้งครรภ์และยังไม่ได้รับ dT/aP ใน 280 วัน',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"vaccine","codes":["106","P41"],"column":"days_since","op":"gt_or_empty","value":"280"}]', true, 160),
('PP.ANC_2Q', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'คัดกรองซึมเศร้าหญิงตั้งครรภ์ (2Q)', 'ตั้งครรภ์และยังไม่มีรหัส 1B140/1B141/1B149 ใน 280 วัน',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"pp_special","codes":["1B140","1B141","1B149"],"column":"days_since","op":"gt_or_empty","value":"280"}]', true, 170),
('PP.POSTPARTUM', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'ตรวจหลังคลอด (ครบ 3 ครั้ง)', 'คลอดไม่เกิน 42 วันและตรวจหลังคลอดยังไม่ครบ 3 ครั้ง',
 '[{"source":"anc","column":"postpartum_days","op":"lte","value":"42"},{"source":"anc","column":"postpartum_visits","op":"lt","value":"3"}]', true, 180),
('PP.UNPLANNED', 'PP', 'หญิงตั้งครรภ์และหลังคลอด', 'บริการทางเลือกปลอดภัยกรณีตั้งครรภ์ไม่พร้อม', 'ปิดไว้: HIS ไม่มีข้อมูลว่าตั้งครรภ์ไม่พร้อม ต้องให้เจ้าหน้าที่ประเมินเอง',
 '[{"source":"anc","column":"pregnant","op":"eq","value":"1"},{"source":"patient","column":"age_y","op":"lt","value":"20"}]', false, 190),
-- เด็กเล็ก 0–5 ปี
('PP.NEWBORN_SCREEN', 'PP', 'เด็กเล็ก 0–5 ปี', 'คัดกรองทารกแรกเกิด (TSH, PKU, เมตาบอลิก)', 'อายุต่ำกว่า 2 เดือนและยังไม่เคยตรวจ TSH',
 '[{"source":"patient","column":"age_m","op":"lt","value":"2"},{"source":"lab","codes":["339"],"column":"days_since","op":"empty"}]', true, 210),
('PP.NEWBORN_HEARING', 'PP', 'เด็กเล็ก 0–5 ปี', 'คัดกรองการได้ยิน', 'อายุต่ำกว่า 12 เดือนและยังไม่เคยมีรหัสคัดกรองการได้ยิน',
 '[{"source":"patient","column":"age_m","op":"lt","value":"12"},{"source":"pp_special","codes":["1B1140","1B1141","1B1142","1B1143","1B1144","1B1149","1B710","1B711"],"column":"days_since","op":"empty"}]', true, 220),
('PP.DSPM', 'PP', 'เด็กเล็ก 0–5 ปี', 'ตรวจพัฒนาการเด็ก (DSPM)', 'อายุ 9, 18, 30, 42 หรือ 60 เดือน และไม่ได้คัดกรองพัฒนาการใน 60 วัน',
 '[{"source":"patient","column":"age_m","op":"in","value":"9,18,30,42,60"},{"source":"pp_special","codes":["1B200","1B201","1B202","1B210","1B211","1B212","1B220","1B221","1B222","1B230","1B231","1B232","1B240","1B241","1B242","1B260","1B261","1B262"],"column":"days_since","op":"gt_or_empty","value":"60"}]', true, 230),
('PP.CHILD_VISION', 'PP', 'เด็กเล็ก 0–5 ปี', 'คัดกรองสายตาเด็ก', 'ปิดไว้: ยังไม่พบรหัส pp_special ของการคัดกรองสายตาเด็กที่ใช้จริง ใส่รหัสแล้วค่อยเปิด',
 '[{"source":"patient","column":"age_y","op":"between","value":"3,5"}]', false, 240),
('PP.EPI', 'PP', 'เด็กเล็ก 0–5 ปี', 'วัคซีนพื้นฐานตามวัย', 'อายุตรงช่วงนัดวัคซีน (2, 4, 6, 9, 12, 18, 30, 48 เดือน) และไม่ได้รับวัคซีน EPI ใน 28 วัน',
 '[{"source":"patient","column":"age_m","op":"in","value":"2,4,6,9,12,18,30,48"},{"source":"vaccine","codes":["010","041","042","043","D21","D22","D23","083","084","085","I11","I12","061","073","076","J11","J12","031","032","033","034","035","091","092","093","R11","R12","R21","R22","R23","P21"],"column":"days_since","op":"gt_or_empty","value":"28"}]', true, 250),
('PP.CHILD_IRON', 'PP', 'เด็กเล็ก 0–5 ปี', 'ยาน้ำเสริมธาตุเหล็กเด็ก', 'อายุ 6–60 เดือนและไม่ได้รับยาน้ำธาตุเหล็กใน 180 วัน',
 '[{"source":"patient","column":"age_m","op":"between","value":"6,60"},{"source":"drug","codes":["1660014","1660027","1460159","1900221"],"column":"days_since","op":"gt_or_empty","value":"180"}]', true, 260),
('PP.CHILD_ORAL', 'PP', 'เด็กเล็ก 0–5 ปี', 'ตรวจช่องปากและเคลือบฟลูออไรด์', 'อายุ 6–60 เดือนและไม่ได้คัดกรองช่องปากใน 180 วัน',
 '[{"source":"patient","column":"age_m","op":"between","value":"6,60"},{"source":"pp_special","codes":["1B730","1B731"],"column":"days_since","op":"gt_or_empty","value":"180"}]', true, 270),
-- เด็กโตและวัยรุ่น 6–24 ปี
('PP.HPV_VACCINE', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'วัคซีน HPV', 'หญิงอายุ 11–20 ปีที่ยังไม่เคยได้รับ HPV',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},{"source":"patient","column":"age_y","op":"between","value":"11,20"},{"source":"vaccine","codes":["310","311","320","HPVC21","HPVC22","HPVC23"],"column":"days_since","op":"empty"}]', true, 310),
('PP.DT_BOOSTER', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'วัคซีนคอตีบ-บาดทะยัก (dT/Tdap)', 'อายุ 12–24 ปีและไม่ได้รับ dT ใน 10 ปี',
 '[{"source":"patient","column":"age_y","op":"between","value":"12,24"},{"source":"vaccine","codes":["106","024","901"],"column":"days_since","op":"gt_or_empty","value":"3650"}]', true, 320),
('PP.TEEN_ANEMIA', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'คัดกรองโลหิตจางและให้ธาตุเหล็ก', 'หญิงอายุ 13–24 ปีที่ไม่ได้ตรวจ Hct ใน 1 ปี',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},{"source":"patient","column":"age_y","op":"between","value":"13,24"},{"source":"lab","codes":["744","4"],"column":"days_since","op":"gt_or_empty","value":"365"}]', true, 330),
('PP.TEEN_RISK', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'คัดกรองพฤติกรรมเสี่ยง บุหรี่ สุรา สารเสพติด', 'อายุ 10–24 ปีและไม่ได้คัดกรองบุหรี่/สุราในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"10,24"},{"source":"pp_special","codes":["1B50","1B501","1B502","1B505","1B51","1B52","1B600","1B601","1B602","1B603"],"column":"count_fy","op":"eq","value":"0"}]', true, 340),
('PP.TEEN_DENTAL', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'ทันตกรรมป้องกัน', 'อายุ 6–12 ปีและไม่ได้คัดกรองช่องปากในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"6,12"},{"source":"pp_special","codes":["1B730","1B731"],"column":"count_fy","op":"eq","value":"0"}]', true, 350),
('PP.TEEN_FP', 'PP', 'เด็กโตและวัยรุ่น 6–24 ปี', 'ปรึกษา/บริการคุมกำเนิด', 'ปิดไว้: จะตรงกับหญิงวัยรุ่นเกือบทุกคน ควรเพิ่มเงื่อนไข (เช่น รหัส PP การให้คำปรึกษา) ก่อนเปิด',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},{"source":"patient","column":"age_y","op":"between","value":"15,24"},{"source":"diag","codes":["Z30"],"column":"days_since","op":"gt_or_empty","value":"365"}]', false, 360),
-- ผู้ใหญ่ 25–59 ปี
('PP.DMHT', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'คัดกรองเบาหวานและความดันโลหิตสูง', 'อายุ 35–59 ปี ไม่เคยวินิจฉัย DM/HT และยังไม่ได้คัดกรองในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"35,59"},{"source":"dmht_screen","column":"count_fy","op":"eq","value":"0"},{"source":"diag","codes":["E10","E11","E12","E13","E14","I10","I11","I12","I13","I15"],"column":"days_since","op":"empty"}]', true, 410),
('PP.CERVICAL', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'คัดกรองมะเร็งปากมดลูก (HPV DNA / Pap)', 'หญิงอายุ 30–59 ปีที่ไม่ได้คัดกรองใน 5 ปี',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},{"source":"patient","column":"age_y","op":"between","value":"30,59"},{"source":"pp_special","codes":["1B0040","1B0041","1B0042","1B0043","1B0044","1B0045","1B0046","1B30","1B40"],"column":"days_since","op":"gt_or_empty","value":"1825"},{"source":"lab","codes":["1017"],"column":"days_since","op":"gt_or_empty","value":"1825"}]', true, 420),
('PP.COLORECTAL', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'คัดกรองมะเร็งลำไส้ใหญ่ (FIT)', 'อายุ 50–70 ปีที่ไม่ได้ตรวจ FIT ใน 2 ปี (ครอบคลุมผู้สูงอายุถึง 70 ปี)',
 '[{"source":"patient","column":"age_y","op":"between","value":"50,70"},{"source":"pp_special","codes":["1B0060","1B0061"],"column":"days_since","op":"gt_or_empty","value":"730"},{"source":"lab","codes":["978","294"],"column":"days_since","op":"gt_or_empty","value":"730"}]', true, 430),
('PP.ORAL_CANCER', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'คัดกรองมะเร็งช่องปาก', 'ปิดไว้: ยังไม่พบรหัส pp_special ของการคัดกรองมะเร็งช่องปากที่ใช้จริง ใส่รหัสแล้วค่อยเปิด',
 '[{"source":"patient","column":"age_y","op":"gte","value":"40"}]', false, 440),
('PP.BRCA', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'ตรวจยีน BRCA1/2 (กลุ่มเสี่ยงมะเร็งเต้านม)', 'ปิดไว้: HIS ไม่มีข้อมูลประวัติครอบครัว/กลุ่มเสี่ยง',
 '[{"source":"patient","column":"sex","op":"eq","value":"2"},{"source":"diag","codes":["Z803"],"column":"days_since","op":"not_empty"}]', false, 450),
('PP.FLU_RISK', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'วัคซีนไข้หวัดใหญ่ (กลุ่มเสี่ยงโรคเรื้อรัง)', 'อายุ 25–64 ปี มีโรคเรื้อรัง (COPD หอบหืด หัวใจ หลอดเลือดสมอง ไตวาย เบาหวาน มะเร็ง) ใน 2 ปี และยังไม่ได้วัคซีนปีงบนี้',
 '[{"source":"patient","column":"age_y","op":"between","value":"25,64"},{"source":"diag","codes":["J44","J45","I20","I21","I22","I23","I24","I25","I50","I63","I64","I69","N18","E10","E11","C"],"column":"days_since","op":"lte","value":"730"},{"source":"vaccine","codes":["815","817"],"column":"count_fy","op":"eq","value":"0"}]', true, 460),
('PP.HIV_PEP', 'PP', 'ผู้ใหญ่ 25–59 ปี', 'ยาป้องกันการติดเชื้อ HIV (PEP)', 'ปิดไว้: ต้องประเมินการสัมผัสเชื้อหน้างาน ใช้ได้เมื่อมีรหัสวินิจฉัยการสัมผัส (Z20.6)',
 '[{"source":"diag","codes":["Z206"],"column":"days_since","op":"lte","value":"3"}]', false, 470),
-- ผู้สูงอายุ 60 ปีขึ้นไป
('PP.ELDER_CVD', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'ประเมินความเสี่ยงโรคหัวใจและหลอดเลือด', 'อายุ 60 ปีขึ้นไปและยังไม่ได้ประเมินในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"pp_special","codes":["1B1230","1B1231","1B1232","1B1234","1B1235","1B1239"],"column":"count_fy","op":"eq","value":"0"}]', true, 510),
('PP.ELDER_DEMENTIA', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'คัดกรองภาวะสมองเสื่อม', 'อายุ 60 ปีขึ้นไปและยังไม่ได้คัดกรองในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"pp_special","codes":["1B1220","1B1221","1B1223","1B1224","1B1225","1B1226","1B1229"],"column":"count_fy","op":"eq","value":"0"}]', true, 520),
('PP.ELDER_DEPRESSION', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'คัดกรองภาวะซึมเศร้า', 'อายุ 60 ปีขึ้นไปและยังไม่ได้คัดกรองในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"pp_special","codes":["1B0280","1B0281","1B0282","1B0283","1B0284","1B0285","1B0289"],"column":"count_fy","op":"eq","value":"0"}]', true, 530),
('PP.ELDER_KNEE', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'คัดกรองข้อเข่าเสื่อม', 'อายุ 60 ปีขึ้นไปและยังไม่ได้คัดกรองในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"pp_special","codes":["1B1270","1B1271","1B1272","1B1279"],"column":"count_fy","op":"eq","value":"0"}]', true, 540),
('PP.ELDER_FALL', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'คัดกรองความเสี่ยงพลัดตกหกล้ม', 'อายุ 60 ปีขึ้นไปและยังไม่ได้คัดกรองในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"pp_special","codes":["1B1200","1B1201","1B1202","1B1203","1B1209"],"column":"count_fy","op":"eq","value":"0"}]', true, 550),
('PP.ELDER_DMHT', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'คัดกรองเบาหวานและความดันโลหิตสูง', 'อายุ 60 ปีขึ้นไป ไม่เคยวินิจฉัย DM/HT และยังไม่ได้คัดกรองในปีงบประมาณนี้ (มะเร็งตามช่วงวัย: ดู FIT ที่ครอบคลุมถึง 70 ปี)',
 '[{"source":"patient","column":"age_y","op":"gte","value":"60"},{"source":"dmht_screen","column":"count_fy","op":"eq","value":"0"},{"source":"diag","codes":["E10","E11","E12","E13","E14","I10","I11","I12","I13","I15"],"column":"days_since","op":"empty"}]', true, 560),
('PP.ELDER_FLU', 'PP', 'ผู้สูงอายุ 60 ปีขึ้นไป', 'วัคซีนไข้หวัดใหญ่ประจำปี', 'อายุ 65 ปีขึ้นไป (เกณฑ์ สปสช. ปรับเป็น 60 ได้) และยังไม่ได้วัคซีนในปีงบประมาณนี้',
 '[{"source":"patient","column":"age_y","op":"gte","value":"65"},{"source":"vaccine","codes":["815","817"],"column":"count_fy","op":"eq","value":"0"}]', true, 570);
