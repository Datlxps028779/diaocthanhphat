-- Commerce pricing policy preflight/verification. READ ONLY.
-- No pricing, VAT, terms or provider values are seeded here.

WITH functions AS (
  SELECT
    p.oid,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.commerce_admin_get_wallet_configuration()'),
    to_regprocedure('public.commerce_admin_save_fee_product(uuid,text,integer,text,text,text,bigint,integer,text,text,text,boolean,boolean,timestamptz,timestamptz)'),
    to_regprocedure('public.commerce_admin_get_fee_product_rules()'),
    to_regprocedure('public.commerce_admin_save_fee_product_rule(uuid,uuid,text,uuid,integer,boolean,timestamptz,timestamptz)')
  )
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('commerce_wallet_topup_config', 'commerce_wallet_topup_options', 'commerce_fee_products', 'commerce_fee_product_rules')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
), results AS (
  SELECT
    (SELECT count(*) = 4
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(authenticated_execute)
      AND bool_and(NOT anon_execute)
      FROM functions) AS functions_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    NOT COALESCE((SELECT is_active FROM public.commerce_wallet_topup_config WHERE id = true), false) AS topup_activation_closed,
    NOT EXISTS (
      SELECT 1
      FROM public.commerce_wallet_topup_config
      WHERE id = true
        AND (
          custom_amount_enabled IS DISTINCT FROM false
          OR custom_min_minor IS NOT NULL
          OR custom_max_minor IS NOT NULL
          OR custom_step_minor IS NOT NULL
        )
    ) AS fixed_amount_only,
    NOT EXISTS (
      SELECT 1
      FROM public.commerce_wallet_receipts
      WHERE document_type IS DISTINCT FROM 'internal_receipt'
    ) AS wallet_receipts_internal_only
)
SELECT jsonb_build_object(
  'functions_hardened', functions_hardened,
  'no_client_table_grants', no_client_table_grants,
  'topup_activation_closed', topup_activation_closed,
  'fixed_amount_only', fixed_amount_only,
  'wallet_receipts_internal_only', wallet_receipts_internal_only,
  'commerce_pricing_policy_verify_pass', (
    functions_hardened
    AND no_client_table_grants
    AND topup_activation_closed
    AND fixed_amount_only
    AND wallet_receipts_internal_only
  )
)
FROM results;
