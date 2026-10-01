-- Commerce Wallet admin configuration preflight. READ ONLY.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_config') IS NOT NULL AS has_topup_config,
    to_regclass('public.commerce_wallet_topup_options') IS NOT NULL AS has_topup_options,
    to_regclass('public.commerce_fee_products') IS NOT NULL AS has_fee_products,
    to_regclass('public.commerce_audit_events') IS NOT NULL AS has_commerce_audit,
    to_regclass('public.staff_permission_catalog') IS NOT NULL AS has_permission_catalog,
    to_regprocedure('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)') IS NOT NULL AS has_permission_function
), functions AS (
  SELECT name, to_regprocedure(format('public.%s', name)) IS NOT NULL AS present
  FROM (VALUES
    ('commerce_admin_get_wallet_configuration()'),
    ('commerce_admin_update_wallet_topup_config(boolean,boolean,bigint,bigint,bigint)'),
    ('commerce_admin_save_wallet_topup_option(uuid,text,text,bigint,boolean,integer)'),
    ('commerce_admin_save_fee_product(uuid,text,integer,text,text,text,bigint,integer,text,text,text,boolean,boolean,timestamptz,timestamptz)')
  ) AS planned(name)
)
SELECT jsonb_build_object(
  'has_topup_config', has_topup_config,
  'has_topup_options', has_topup_options,
  'has_fee_products', has_fee_products,
  'has_commerce_audit', has_commerce_audit,
  'has_permission_catalog', has_permission_catalog,
  'has_permission_function', has_permission_function,
  'existing_admin_functions', (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) FROM functions WHERE present),
  'commerce_wallet_admin_config_preflight_pass', (
    has_topup_config AND has_topup_options AND has_fee_products
    AND has_commerce_audit AND has_permission_catalog AND has_permission_function
  )
)
FROM prerequisites;
