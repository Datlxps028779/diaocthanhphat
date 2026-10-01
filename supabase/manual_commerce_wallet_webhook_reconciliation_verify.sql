-- Commerce Wallet webhook/reconciliation post-migration verification. READ ONLY.

WITH functions AS (
  SELECT
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.commerce_process_wallet_payment_webhook(uuid,uuid)'),
    to_regprocedure('public.commerce_claim_wallet_topup_reconciliations(integer)'),
    to_regprocedure('public.commerce_complete_wallet_topup_reconciliation(uuid,uuid,text,text,bigint,text,text,timestamptz,timestamptz)'),
    to_regprocedure('public.commerce_fail_wallet_topup_reconciliation(uuid,uuid,text,boolean)')
  )
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'commerce_wallet_topup_reconciliation_jobs'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), trigger_present AS (
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trg_commerce_wallet_topup_reconciliation_job'
      AND n.nspname = 'public'
      AND c.relname = 'commerce_wallet_topup_checkouts'
      AND NOT t.tgisinternal
  ) AS present
), results AS (
  SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commerce_wallet_topup_reconciliation_jobs'::regclass) AS rls_enabled,
    (SELECT count(*) = 4
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(service_execute)
      AND bool_and(NOT authenticated_execute)
      AND bool_and(NOT anon_execute)
      FROM functions) AS functions_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    (SELECT present FROM trigger_present) AS reconciliation_trigger_present,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_payment_events e
      JOIN public.commerce_wallet_topup_checkouts c
        ON c.provider = e.provider
       AND c.provider_payment_id = e.provider_payment_id
      WHERE e.payment_attempt_id IS NOT NULL OR e.order_id IS NOT NULL
    ) AS wallet_events_not_linked_to_package_orders,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_topup_reconciliation_jobs j
      JOIN public.commerce_wallet_topup_checkouts c ON c.id = j.topup_checkout_id
      WHERE j.provider <> c.provider
         OR j.provider_payment_id <> c.provider_payment_id
         OR j.amount_minor <> c.amount_minor
         OR j.currency <> c.currency
    ) AS reconciliation_snapshots_match
)
SELECT jsonb_build_object(
  'rls_enabled', rls_enabled,
  'functions_hardened', functions_hardened,
  'no_client_table_grants', no_client_table_grants,
  'reconciliation_trigger_present', reconciliation_trigger_present,
  'wallet_events_not_linked_to_package_orders', wallet_events_not_linked_to_package_orders,
  'reconciliation_snapshots_match', reconciliation_snapshots_match,
  'commerce_wallet_webhook_reconciliation_verify_pass', (
    rls_enabled
    AND functions_hardened
    AND no_client_table_grants
    AND reconciliation_trigger_present
    AND wallet_events_not_linked_to_package_orders
    AND reconciliation_snapshots_match
  )
) AS commerce_wallet_webhook_reconciliation_verify
FROM results;
