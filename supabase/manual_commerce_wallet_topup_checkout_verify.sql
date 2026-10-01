-- Commerce wallet top-up checkout post-migration verification. READ ONLY.

WITH expected_columns(name) AS (
  VALUES
    ('id'), ('topup_intent_id'), ('owner_user_id'), ('provider'), ('provider_order_code'),
    ('amount_minor'), ('currency'), ('status'), ('idempotency_key'), ('provider_payment_id'),
    ('checkout_url'), ('expires_at'), ('claim_token'), ('claim_expires_at'),
    ('recovery_error_code'), ('created_at'), ('updated_at')
), columns AS (
  SELECT e.name, c.column_name IS NOT NULL AS present
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'commerce_wallet_topup_checkouts'
   AND c.column_name = e.name
), functions AS (
  SELECT
    p.oid,
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.commerce_start_wallet_topup_checkout(uuid,text,text)'),
    to_regprocedure('public.commerce_claim_wallet_topup_checkout(uuid,text)'),
    to_regprocedure('public.commerce_attach_wallet_topup_checkout(uuid,text,text,text,timestamptz)'),
    to_regprocedure('public.commerce_recover_wallet_topup_checkout(uuid,text,text,text)')
  )
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'commerce_wallet_topup_checkouts'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), provider_sequence_function AS (
  SELECT pg_get_functiondef(to_regprocedure('public.commerce_start_wallet_topup_checkout(uuid,text,text)')) ILIKE '%pg_get_serial_sequence(''public.commerce_payment_attempts'', ''provider_order_code'')%' AS uses_shared_sequence
), results AS (
  SELECT
    (SELECT count(*) = 17 AND bool_and(present) FROM columns) AS checkout_columns_present,
    (
      SELECT count(*) = 4
        AND bool_and(prosecdef)
        AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
        AND bool_and(
          CASE WHEN proname = 'commerce_start_wallet_topup_checkout'
            THEN authenticated_execute
            ELSE service_execute AND NOT authenticated_execute
          END
        )
        AND bool_and(NOT anon_execute)
      FROM functions
    ) AS checkout_functions_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commerce_wallet_topup_checkouts'::regclass) AS rls_enabled,
    (SELECT uses_shared_sequence FROM provider_sequence_function) AS uses_shared_provider_sequence,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_topup_checkouts c
      JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
      WHERE c.owner_user_id <> i.owner_user_id
         OR c.amount_minor <> i.requested_amount_minor
         OR c.currency <> i.currency
    ) AS snapshots_match_intents,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_topup_checkouts c
      JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
      WHERE c.provider_payment_id IS NOT NULL
        AND (i.provider IS DISTINCT FROM c.provider OR i.provider_payment_id IS DISTINCT FROM c.provider_payment_id)
    ) AS provider_identity_matches_intents,
    NOT EXISTS (
      SELECT provider_order_code
      FROM (
        SELECT provider_order_code FROM public.commerce_payment_attempts
        UNION ALL
        SELECT provider_order_code FROM public.commerce_wallet_topup_checkouts
      ) codes
      GROUP BY provider_order_code
      HAVING count(*) > 1
    ) AS provider_codes_unique_across_domains
)
SELECT jsonb_build_object(
  'checkout_columns_present', checkout_columns_present,
  'checkout_functions_hardened', checkout_functions_hardened,
  'no_client_table_grants', no_client_table_grants,
  'rls_enabled', rls_enabled,
  'uses_shared_provider_sequence', uses_shared_provider_sequence,
  'snapshots_match_intents', snapshots_match_intents,
  'provider_identity_matches_intents', provider_identity_matches_intents,
  'provider_codes_unique_across_domains', provider_codes_unique_across_domains,
  'commerce_wallet_topup_checkout_verify_pass', (
    checkout_columns_present
    AND checkout_functions_hardened
    AND no_client_table_grants
    AND rls_enabled
    AND uses_shared_provider_sequence
    AND snapshots_match_intents
    AND provider_identity_matches_intents
    AND provider_codes_unique_across_domains
  )
) AS commerce_wallet_topup_checkout_verify
FROM results;
