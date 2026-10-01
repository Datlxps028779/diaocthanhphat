-- Commerce Wallet Foundation post-migration verification. READ ONLY.
-- Run after 20261014120000_commerce_wallet_foundation.sql.

WITH expected_tables(name) AS (
  VALUES
    ('commerce_wallet_accounts'),
    ('commerce_wallet_topup_config'),
    ('commerce_wallet_topup_options'),
    ('commerce_fee_products'),
    ('commerce_wallet_topup_intents'),
    ('commerce_wallet_fee_reservations'),
    ('commerce_wallet_ledger'),
    ('commerce_wallet_receipts')
), tables AS (
  SELECT
    e.name,
    c.oid IS NOT NULL AS exists,
    COALESCE(c.relrowsecurity, false) AS rls_enabled
  FROM expected_tables e
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', e.name))
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'commerce_wallet_%'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), guard_functions AS (
  SELECT
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'guard_commerce_wallet_account_identity',
      'guard_commerce_wallet_ledger_append_only',
      'guard_commerce_wallet_topup_identity',
      'guard_commerce_wallet_fee_identity'
    )
), results AS (
  SELECT
    (SELECT count(*) = 8 AND bool_and(exists) FROM tables) AS all_wallet_tables_exist,
    (SELECT count(*) = 8 AND bool_and(rls_enabled) FROM tables) AS all_wallet_tables_rls,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_wallet_client_write_grants,
    (
      SELECT count(*) = 4
        AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
        AND bool_and(NOT anon_execute)
        AND bool_and(NOT authenticated_execute)
      FROM guard_functions
    ) AS wallet_guard_functions_hardened,
    (SELECT count(*) = 0 FROM public.commerce_wallet_topup_options) AS no_topup_option_seed,
    (SELECT count(*) = 0 FROM public.commerce_fee_products) AS no_fee_product_seed,
    to_regclass('public.commerce_wallet_ledger') IS NOT NULL AS wallet_ledger_present,
    NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname ~ 'commerce_wallet_(withdraw|refund)'
    ) AS no_withdraw_or_wallet_refund_table
)
SELECT jsonb_build_object(
  'all_wallet_tables_exist', all_wallet_tables_exist,
  'all_wallet_tables_rls', all_wallet_tables_rls,
  'no_wallet_client_write_grants', no_wallet_client_write_grants,
  'wallet_guard_functions_hardened', wallet_guard_functions_hardened,
  'no_topup_option_seed', no_topup_option_seed,
  'no_fee_product_seed', no_fee_product_seed,
  'wallet_ledger_present', wallet_ledger_present,
  'no_withdraw_or_wallet_refund_table', no_withdraw_or_wallet_refund_table,
  'commerce_wallet_foundation_verify_pass', (
    all_wallet_tables_exist
    AND all_wallet_tables_rls
    AND no_wallet_client_write_grants
    AND wallet_guard_functions_hardened
    AND no_topup_option_seed
    AND no_fee_product_seed
    AND wallet_ledger_present
    AND no_withdraw_or_wallet_refund_table
  )
) AS commerce_wallet_foundation_verify
FROM results;
