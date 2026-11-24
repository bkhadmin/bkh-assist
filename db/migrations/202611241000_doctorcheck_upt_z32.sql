-- Doctorcheck: new rule UPT_Z32 (a urine pregnancy test order needs Z32.0 or Z32.1), defined in
-- apps/web/src/lib/rules/modules/doctor-check.ts. This row only places it after the external cause rule on the admin page.
insert into rule_settings (rule_code, module_code, sort_order) values
  ('Doctorcheck.UPT_Z32', 'Doctorcheck', 35)
on conflict (rule_code) do nothing;
