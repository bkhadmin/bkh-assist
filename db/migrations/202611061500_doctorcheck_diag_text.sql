-- Doctorcheck: new rule DIAG_TEXT (ovst.diag_text), defined in apps/web/src/lib/rules/modules/doctor-check.ts.
-- This row only places it right after the principal diagnosis on the admin page.
insert into rule_settings (rule_code, module_code, sort_order) values
  ('Doctorcheck.DIAG_TEXT', 'Doctorcheck', 25)
on conflict (rule_code) do nothing;
