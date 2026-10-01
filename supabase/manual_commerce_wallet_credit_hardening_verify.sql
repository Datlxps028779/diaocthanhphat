-- Commerce wallet credit hardening post-migration verification. READ ONLY.

WITH expected_indexes(name, expected_predicate) AS (
  VALUES
    ('uq_commerce_wallet_ledger_topup_intent', 'topup_credit'),
    ('uq_commerce_wallet_receipts_topup_intent', 'wallet_topup')
), indexes AS (
  SELECT
    e.name,
    i.indexdef,
    i.indexdef IS NOT NULL
      AND i.indexdef ILIKE '%CREATE UNIQUE INDEX%'
      AND i.indexdef ILIKE '%' || e.expected_predicate || '%' AS is_hardened
  FROM expected_indexes e
  LEFT JOIN pg_indexes i
    ON i.schemaname = 'public' AND i.indexname = e.name
), functions AS (
  SELECT
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid IN (
      to_regprocedure('public.commerce_attach_wallet_topup_payment(uuid,text,text)'),
      to_regprocedure('public.commerce_credit_wallet_topup(uuid,bigint,text,text,text,text)')
    )
), duplicate_ledgers AS (
  SELECT topup_intent_id
  FROM public.commerce_wallet_ledger
  WHERE operation = 'topup_credit'
  GROUP BY topup_intent_id
  HAVING count(*) > 1
), duplicate_receipts AS (
  SELECT topup_intent_id
  FROM public.commerce_wallet_receipts
  WHERE receipt_kind = 'wallet_topup'
  GROUP BY topup_intent_id
  HAVING count(*) > 1
), inconsistent_intents AS (
  SELECT i.id
  FROM public.commerce_wallet_topup_intents i
  WHERE (i.status = 'credited') IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.commerce_wallet_ledger l
    WHERE l.operation = 'topup_credit' AND l.topup_intent_id = i.id
  )
  OR (i.status = 'credited') IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.commerce_wallet_receipts r
    WHERE r.receipt_kind = 'wallet_topup' AND r.topup_intent_id = i.id
  )
), results AS (
  SELECT
    (SELECT count(*) = 2 AND bool_and(is_hardened) FROM indexes) AS unique_evidence_indexes_present,
    (
      SELECT count(*) = 2
        AND bool_and(prosecdef)
        AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
        AND bool_and(service_execute)
        AND bool_and(NOT anon_execute)
        AND bool_and(NOT authenticated_execute)
      FROM functions
    ) AS wallet_credit_functions_hardened,
    NOT EXISTS (SELECT 1 FROM duplicate_ledgers) AS no_duplicate_credit_ledgers,
    NOT EXISTS (SELECT 1 FROM duplicate_receipts) AS no_duplicate_topup_receipts,
    NOT EXISTS (SELECT 1 FROM inconsistent_intents) AS wallet_credit_evidence_consistent
)
SELECT jsonb_build_object(
  'unique_evidence_indexes_present', unique_evidence_indexes_present,
  'wallet_credit_functions_hardened', wallet_credit_functions_hardened,
  'no_duplicate_credit_ledgers', no_duplicate_credit_ledgers,
  'no_duplicate_topup_receipts', no_duplicate_topup_receipts,
  'wallet_credit_evidence_consistent', wallet_credit_evidence_consistent,
  'commerce_wallet_credit_hardening_verify_pass', (
    unique_evidence_indexes_present
    AND wallet_credit_functions_hardened
    AND no_duplicate_credit_ledgers
    AND no_duplicate_topup_receipts
    AND wallet_credit_evidence_consistent
  )
) AS commerce_wallet_credit_hardening_verify
FROM results;
