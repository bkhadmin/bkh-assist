-- Manual price (baht) for lump-sum payments with no HOSxP item, e.g. NHSO DM remission 4,000 / 2,000 baht.
-- When set, the agent shows it instead of the sum of the icodes' prices; NULL = use the icodes.
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS price numeric(12,2) NULL;
