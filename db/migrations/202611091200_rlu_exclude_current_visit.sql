-- RLU "already done, do not re-order": a lab ordered in the visit being checked must not count as the earlier test,
-- or every fresh order would warn about itself (seen 12x in 200 visits for CU_CR). Point the RLU items' lab
-- history conditions at the new lab column days_since_prev (apps/web/src/lib/opportunities/sources.ts), which
-- ignores orders of the current visit. Opportunities keep days_since: there an order today means "done".
update rlu_items r
set conditions = (
      select jsonb_agg(
               case when c->>'source' in ('lab', 'lab_provis') and c->>'column' = 'days_since'
                    then jsonb_set(c, '{column}', '"days_since_prev"')
                    else c end
               order by ord)
      from jsonb_array_elements(r.conditions) with ordinality as t(c, ord)
    ),
    updated_at = now()
where exists (select 1 from jsonb_array_elements(r.conditions) c
              where c->>'source' in ('lab', 'lab_provis') and c->>'column' = 'days_since');

-- PP.ANC_SUPP: folic acid icode 1000135 is inactive at this hospital; 1900222 is the one dispensed (12k times this FY).
update opportunities o
set conditions = (
      select jsonb_agg(
               case when c->>'source' = 'drug' and c->'codes' ? '1000135' and not c->'codes' ? '1900222'
                    then jsonb_set(c, '{codes}', (c->'codes') || '["1900222"]')
                    else c end
               order by ord)
      from jsonb_array_elements(o.conditions) with ordinality as t(c, ord)
    ),
    updated_at = now()
where o.code = 'PP.ANC_SUPP';
