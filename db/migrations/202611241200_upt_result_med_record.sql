-- UPT_Z32 now follows the result (Negative -> Z32.0, Positive -> Z32.1, no result -> not checked), shared by
-- apps/web/src/lib/rules/modules/upt-z32.ts. It also runs at ซักประวัติ OPD and in a new module งานเวชระเบียน.
-- These rows are only the admin switches; the rules are defined in code.

-- งานเวชระเบียน: HOSxP screen TPatientOPDVisitListForm (the coders' visit list); assigned to machines on the admin page.
insert into modules (code, label, hosxp_form, description) values
  ('MedRecordcheck', 'งานเวชระเบียน', 'TPatientOPDVisitListForm',
   'ตรวจการลงรหัสของงานเวชระเบียน: ผล Urine pregnancy test ต้องลงรหัสตามผล (ผลลบ Z32.0 · ผลบวก Z32.1)')
on conflict (code) do nothing;

insert into rule_settings (rule_code, module_code, sort_order) values
  ('OPDVisitcheck.UPT_Z32', 'OPDVisitcheck', 70),
  ('MedRecordcheck.UPT_Z32', 'MedRecordcheck', 10)
on conflict (rule_code) do nothing;
