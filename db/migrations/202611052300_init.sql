-- bkh_assist initial schema.
-- Rule SQL lives in code (apps/web/src/lib/rules/modules, proven by prove-query);
-- the DB only stores per-rule switches, so an admin can never inject SQL that runs on HIS.

-- Machines that run the agent. Created on first contact (by hostname); an admin assigns modules.
create table machines (
  id bigint generated always as identity primary key,
  machine_name text not null unique,             -- Windows hostname reported by the agent
  display_name text,                             -- e.g. "OPD จุดซักประวัติ 1"
  department text,
  ip_address inet,
  agent_version text,
  token_hash text unique,                        -- sha256 of the per-machine token (null until enrolled)
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A module = one HOSxP screen + the rules checked when it is saved.
create table modules (
  code text primary key,                         -- e.g. 'OPDVisitcheck'
  label text not null,
  hosxp_form text,                               -- Delphi form class, e.g. 'TDoctorWorkBenchQueueManagerForm'
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-rule switches; the rule itself (label, SQL, default severity) is defined in code.
-- A rule without a row here runs with its code defaults.
create table rule_settings (
  rule_code text primary key,                    -- e.g. 'OPDVisitcheck.BP'
  module_code text not null references modules(code) on update cascade on delete cascade,
  is_active boolean not null default true,
  severity text check (severity in ('error', 'warning')),  -- null = code default
  sort_order integer,
  updated_at timestamptz not null default now()
);

-- Which modules each machine checks.
create table machine_modules (
  machine_id bigint not null references machines(id) on delete cascade,
  module_code text not null references modules(code) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (machine_id, module_code)
);

-- Every check the server answered (for statistics). Never stores names/CID.
create table check_logs (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  saved_at timestamptz not null,                 -- when the user clicked save (agent clock)
  machine_id bigint references machines(id) on delete set null,
  machine_name text not null,
  module_code text not null,
  vn text,
  hn text,
  status text not null check (status in ('ok', 'missing', 'ambiguous', 'not_found')),
  missing jsonb not null default '[]'::jsonb     -- [{code, label, severity}] of failed rules
);
create index check_logs_checked_at_idx on check_logs (checked_at desc);
create index check_logs_module_checked_at_idx on check_logs (module_code, checked_at desc);
create index check_logs_vn_idx on check_logs (vn);

-- Visits saved with missing data and not fixed yet. One row per visit + module;
-- resolved automatically when a later save of the same visit passes.
create table pending_issues (
  id bigint generated always as identity primary key,
  vn text not null,
  hn text not null,
  module_code text not null references modules(code) on update cascade on delete cascade,
  missing jsonb not null,                        -- latest failed rules [{code, label, severity}]
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_machine_id bigint references machines(id) on delete set null,
  resolved_at timestamptz,
  unique (vn, module_code)
);
create index pending_issues_open_hn_idx on pending_issues (hn) where resolved_at is null;
create index pending_issues_open_seen_idx on pending_issues (first_seen_at desc) where resolved_at is null;

-- Seed: the first module and its rules (matching apps/web/src/lib/rules/modules/opd-visit-check.ts).
insert into modules (code, label, hosxp_form, description) values
  ('OPDVisitcheck', 'ซักประวัติ OPD', 'TDoctorWorkBenchQueueManagerForm',
   'ตรวจการบันทึกหน้าซักประวัติ OPD: สัญญาณชีพ น้ำหนัก ส่วนสูง และอาการสำคัญ');

insert into rule_settings (rule_code, module_code, sort_order) values
  ('OPDVisitcheck.BP', 'OPDVisitcheck', 10),
  ('OPDVisitcheck.PULSE', 'OPDVisitcheck', 20),
  ('OPDVisitcheck.TEMP', 'OPDVisitcheck', 30),
  ('OPDVisitcheck.BW', 'OPDVisitcheck', 40),
  ('OPDVisitcheck.HEIGHT', 'OPDVisitcheck', 50),
  ('OPDVisitcheck.CC', 'OPDVisitcheck', 60);
