-- RLU (Rational Lab Use): labs an admin lists for the agent's top bar "RLU" badge (replaces the HbA1c button).
-- An item = one or more HOSxP lab_items_code (its last 3 reported results are shown) + conditions built like
-- opportunities (same sources in apps/web/src/lib/opportunities/sources.ts, all must match). When they match the
-- patient's latest visit the item warns and the badge blinks. No conditions = never warns, results only.

create table rlu_items (
  code text primary key,                          -- e.g. 'HBA1C'
  label text not null,                            -- shown in the agent, e.g. 'HbA1c'
  description text,
  lab_codes text[] not null,                      -- lab_items_code, digits only (validated by the admin action)
  conditions jsonb not null default '[]'::jsonb,  -- [{source, codes?, column, op, value?}], all must match
  message text,                                   -- shown with a warning; null = none
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HbA1c = lab_items_code 334. Same conditions as OFC.HBA1C without the right: diabetes (E10–E14) in 2 years and
-- no HbA1c in 90 days.
insert into rlu_items (code, label, description, lab_codes, conditions, message, sort_order) values
('HBA1C', 'HbA1c', 'ผู้ป่วยเบาหวาน (E10–E14 ใน 2 ปี) ที่ไม่ได้ตรวจ HbA1c ใน 90 วัน', '{334}',
 '[{"source":"diag","codes":["E10","E11","E12","E13","E14"],"column":"days_since","op":"lte","value":"730"},{"source":"lab","codes":["334"],"column":"days_since","op":"gt_or_empty","value":"90"}]',
 'ผู้ป่วยเบาหวาน ไม่ได้ตรวจ HbA1c เกิน 90 วัน', 10);
