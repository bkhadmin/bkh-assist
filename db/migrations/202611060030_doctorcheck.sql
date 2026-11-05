-- Module Doctorcheck (ห้องตรวจแพทย์). Rules are defined in apps/web/src/lib/rules/modules/doctor-check.ts;
-- these rows are only the admin switches. Same HOSxP screen as OPDVisitcheck, so a machine uses one of the two.
insert into modules (code, label, hosxp_form, description) values
  ('Doctorcheck', 'ห้องตรวจแพทย์', 'TDoctorWorkBenchQueueManagerForm',
   'ตรวจการบันทึกของแพทย์: แพทย์ผู้ตรวจ การวินิจฉัยหลัก รหัสสาเหตุภายนอกของการบาดเจ็บ การตรวจร่างกาย และประวัติปัจจุบัน');

insert into rule_settings (rule_code, module_code, sort_order) values
  ('Doctorcheck.DOCTOR', 'Doctorcheck', 10),
  ('Doctorcheck.PDX', 'Doctorcheck', 20),
  ('Doctorcheck.EXTERNAL_CAUSE', 'Doctorcheck', 30),
  ('Doctorcheck.PE', 'Doctorcheck', 40),
  ('Doctorcheck.HPI', 'Doctorcheck', 50);
