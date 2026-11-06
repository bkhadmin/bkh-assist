-- HOSxP items (nondrugitems / drugitems icode) billed for an opportunity: the agent shows their price sum.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS icodes text[] NOT NULL DEFAULT '{}';

-- Hemoglobin A1C (HbA1C) รหัส 32401, 230 baht on bkhosxp 2026-11-06
UPDATE opportunities SET icodes = ARRAY['3001142'] WHERE code = 'OFC.HBA1C' AND icodes = '{}';
