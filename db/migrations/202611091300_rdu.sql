-- RDU (Rational Drug Use) rule switches. The rules themselves (SQL, labels) live in code:
-- apps/web/src/lib/rdu/rules.ts. A rule without a row here is on; /admin/rdu writes a row when switched.
create table rdu_settings (
  rule_code text primary key,                 -- e.g. 'RDU.URI_ABX'
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
