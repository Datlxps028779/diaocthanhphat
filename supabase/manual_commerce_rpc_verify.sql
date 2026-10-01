-- Commerce RPC foundation post-migration verification. READ ONLY.

WITH expected_functions(name, signature, authenticated_expected, service_role_expected) AS (
  VALUES
    ('commerce_create_order', 'public.commerce_create_order(uuid,integer,text)', true, NULL::boolean),
    ('commerce_reserve_listing_quota', 'public.commerce_reserve_listing_quota(uuid,uuid,integer,text,timestamp with time zone)', true, NULL::boolean),
    ('commerce_consume_listing_quota', 'public.commerce_consume_listing_quota(uuid,text)', true, NULL::boolean),
    ('commerce_release_listing_quota', 'public.commerce_release_listing_quota(uuid,text)', true, NULL::boolean),
    ('commerce_start_payment_attempt', 'public.commerce_start_payment_attempt(uuid,text,text)', true, NULL::boolean),
    ('commerce_claim_payment_checkout', 'public.commerce_claim_payment_checkout(uuid,text)', false, true),
    ('commerce_attach_payment_checkout', 'public.commerce_attach_payment_checkout(uuid,text,text,timestamp with time zone)', false, true),
    ('commerce_fail_payment_attempt', 'public.commerce_fail_payment_attempt(uuid,text,text)', false, true),
    ('commerce_enqueue_verified_payment_webhook', 'public.commerce_enqueue_verified_payment_webhook(text,text,text,text,bigint,text,text,text,jsonb,timestamp with time zone)', false, true),
    ('commerce_claim_payment_webhooks', 'public.commerce_claim_payment_webhooks(integer)', false, true),
    ('commerce_process_payment_webhook', 'public.commerce_process_payment_webhook(uuid,uuid)', false, true),
    ('commerce_fail_payment_webhook', 'public.commerce_fail_payment_webhook(uuid,uuid,text,boolean)', false, true),
    ('commerce_claim_payment_reconciliations', 'public.commerce_claim_payment_reconciliations(integer)', false, true),
    ('commerce_complete_payment_reconciliation', 'public.commerce_complete_payment_reconciliation(uuid,uuid,text,text,bigint,text,text,timestamp with time zone,timestamp with time zone)', false, true),
    ('commerce_fail_payment_reconciliation', 'public.commerce_fail_payment_reconciliation(uuid,uuid,text,boolean)', false, true),
    ('commerce_claim_outbox', 'public.commerce_claim_outbox(integer)', false, true),
    ('commerce_deliver_outbox', 'public.commerce_deliver_outbox(uuid,uuid)', false, true),
    ('commerce_fail_outbox', 'public.commerce_fail_outbox(uuid,uuid,text,boolean)', false, true)
), function_state AS (
  SELECT
    e.name,
    e.signature,
    e.authenticated_expected,
    e.service_role_expected,
    p.oid,
    p.prosecdef AS security_definer,
    p.proconfig,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('service_role', p.oid, 'EXECUTE') END AS service_role_execute
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), unsafe_table_grants AS (
  SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'commerce_%'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
), delta_constraint AS (
  SELECT pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.commerce_quota_ledger'::regclass
    AND c.conname = 'commerce_quota_ledger_delta_check'
), worker_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'commerce_payment_events' AND column_name = 'provider_payment_id')
      OR (table_name = 'commerce_webhook_inbox' AND column_name = 'processing_token')
    )
), worker_outbox_index AS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'commerce_outbox'
    AND indexname = 'uq_commerce_outbox_topic_aggregate'
    AND indexdef ILIKE '%UNIQUE%topic%aggregate_type%aggregate_id%'
), reconciliation_verification_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('commerce_payment_events', 'commerce_webhook_inbox')
    AND column_name IN ('verification_method', 'signed_data_hash', 'provider_lookup_hash')
), reconciliation_contract AS (
  SELECT
    c.relrowsecurity,
    t.tgenabled,
    t.tgtype,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_class trigger_table
    ON trigger_table.relnamespace = n.oid
   AND trigger_table.relname = 'commerce_payment_attempts'
  LEFT JOIN pg_trigger t
    ON t.tgrelid = trigger_table.oid
   AND t.tgname = 'trg_commerce_payment_reconciliation_job'
   AND NOT t.tgisinternal
  LEFT JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE c.relname = 'commerce_payment_reconciliation_jobs'
), outbox_delivery_tables AS (
  SELECT c.relname, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('commerce_notifications', 'commerce_operations_alerts')
), outbox_delivery_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'commerce_outbox' AND column_name = 'processing_token')
      OR (table_name = 'commerce_notifications' AND column_name = 'outbox_id')
      OR (table_name = 'commerce_operations_alerts' AND column_name = 'outbox_id')
    )
), outbox_owner_policy AS (
  SELECT 1
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'commerce_notifications'
    AND policyname = 'commerce_notifications_owner_read'
    AND cmd = 'SELECT'
), results AS (
  SELECT
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 18 AS all_functions_exist,
    NOT EXISTS (
      SELECT 1 FROM function_state
      WHERE oid IS NULL
         OR security_definer IS DISTINCT FROM true
         OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
    ) AS all_functions_hardened,
    NOT EXISTS (SELECT 1 FROM function_state WHERE anon_execute IS TRUE) AS anon_execute_denied,
    NOT EXISTS (
      SELECT 1 FROM function_state
      WHERE authenticated_execute IS DISTINCT FROM authenticated_expected
    ) AS authenticated_execute_matches_contract,
    NOT EXISTS (
      SELECT 1 FROM function_state
      WHERE service_role_expected IS NOT NULL
        AND service_role_execute IS DISTINCT FROM service_role_expected
    ) AS service_role_execute_matches_contract,
    NOT EXISTS (SELECT 1 FROM unsafe_table_grants) AS no_client_table_writes,
    (SELECT count(*) FROM worker_columns) = 2
      AND EXISTS (SELECT 1 FROM worker_outbox_index) AS payment_worker_contract_present,
    (SELECT count(*) FROM reconciliation_verification_columns) = 6
      AND (
        SELECT count(*) = 1
          AND bool_and(COALESCE(relrowsecurity, false))
          AND bool_and(COALESCE(tgenabled = 'O', false))
          AND bool_and(COALESCE(tgtype = 17, false))
          AND bool_and(COALESCE(prosecdef, false))
          AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
          AND bool_and(NOT COALESCE(anon_execute, true))
          AND bool_and(NOT COALESCE(authenticated_execute, true))
        FROM reconciliation_contract
      ) AS payment_reconciliation_contract_present,
    (SELECT count(*) = 2 AND bool_and(relrowsecurity) FROM outbox_delivery_tables)
      AND (SELECT count(*) FROM outbox_delivery_columns) = 3
      AND EXISTS (SELECT 1 FROM outbox_owner_policy)
      AS outbox_delivery_contract_present,
    EXISTS (
      SELECT 1 FROM delta_constraint
      WHERE definition ILIKE '%operation%consume%'
        AND definition ILIKE '%delta = 0%'
        AND definition ILIKE '%delta <> 0%'
    ) AS consume_zero_delta_constraint_present
)
SELECT jsonb_build_object(
  'checks', to_jsonb(results),
  'functions', (
    SELECT jsonb_agg(to_jsonb(function_state) ORDER BY name) FROM function_state
  ),
  'unsafe_table_grants', (
    SELECT COALESCE(jsonb_agg(to_jsonb(unsafe_table_grants) ORDER BY table_name, grantee, privilege_type), '[]'::jsonb)
    FROM unsafe_table_grants
  ),
  'quota_delta_constraint', (
    SELECT definition FROM delta_constraint
  ),
  'commerce_rpc_verify_pass', (
    results.all_functions_exist
    AND results.all_functions_hardened
    AND results.anon_execute_denied
    AND results.authenticated_execute_matches_contract
    AND results.service_role_execute_matches_contract
    AND results.no_client_table_writes
    AND results.payment_worker_contract_present
    AND results.payment_reconciliation_contract_present
    AND results.outbox_delivery_contract_present
    AND results.consume_zero_delta_constraint_present
  ),
  'verified_at', now()
) AS commerce_rpc_verify
FROM results;
