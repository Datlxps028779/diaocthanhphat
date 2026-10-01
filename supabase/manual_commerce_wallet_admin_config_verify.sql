-- Commerce Wallet admin configuration verification. READ ONLY.

WITH functions AS (
  SELECT
    p.oid,
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.commerce_admin_get_wallet_configuration()'),
    to_regprocedure('public.commerce_admin_update_wallet_topup_config(boolean,boolean,bigint,bigint,bigint)'),
    to_regprocedure('public.commerce_admin_save_wallet_topup_option(uuid,text,text,bigint,boolean,integer)'),
    to_regprocedure('public.commerce_admin_save_fee_product(uuid,text,integer,text,text,text,bigint,integer,text,text,text,boolean,boolean,timestamptz,timestamptz)')
  )
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('commerce_wallet_topup_config', 'commerce_wallet_topup_options', 'commerce_fee_products')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
), permission_rows AS (
  SELECT
    EXISTS (SELECT 1 FROM public.staff_permission_catalog WHERE module = 'commerce-wallet' AND action = 'view') AS view_permission,
    EXISTS (SELECT 1 FROM public.staff_permission_catalog WHERE module = 'commerce-wallet' AND action = 'edit') AS edit_permission
), results AS (
  SELECT
    (SELECT count(*) = 4
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(authenticated_execute)
      AND bool_and(NOT anon_execute)
      FROM functions) AS functions_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    permission_rows.view_permission,
    permission_rows.edit_permission,
    NOT COALESCE((SELECT is_active FROM public.commerce_wallet_topup_config WHERE id = true), false) AS topup_activation_closed
  FROM permission_rows
)
SELECT jsonb_build_object(
  'functions_hardened', functions_hardened,
  'no_client_table_grants', no_client_table_grants,
  'view_permission', view_permission,
  'edit_permission', edit_permission,
  'topup_activation_closed', topup_activation_closed,
  'commerce_wallet_admin_config_verify_pass', (
    functions_hardened AND no_client_table_grants
    AND view_permission AND edit_permission AND topup_activation_closed
  )
)
FROM results;
