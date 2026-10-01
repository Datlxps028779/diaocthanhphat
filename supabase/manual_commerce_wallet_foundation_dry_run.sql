-- Commerce Wallet Foundation preflight. READ ONLY.
-- Run before 20261014120000_commerce_wallet_foundation.sql.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_payment_attempts') IS NOT NULL AS has_commerce_payment_attempts,
    to_regclass('public.user_listings') IS NOT NULL AS has_user_listings,
    to_regclass('public.properties') IS NOT NULL AS has_properties,
    to_regprocedure('auth.uid()') IS NOT NULL AS has_auth_uid
), planned_tables(name) AS (
  VALUES
    ('commerce_wallet_accounts'),
    ('commerce_wallet_topup_config'),
    ('commerce_wallet_topup_options'),
    ('commerce_fee_products'),
    ('commerce_wallet_topup_intents'),
    ('commerce_wallet_fee_reservations'),
    ('commerce_wallet_ledger'),
    ('commerce_wallet_receipts')
), collisions AS (
  SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS already_exists
  FROM planned_tables
), results AS (
  SELECT
    p.*,
    (SELECT count(*) FROM collisions WHERE already_exists) AS planned_table_collisions,
    (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) FROM collisions WHERE already_exists) AS existing_planned_tables
  FROM prerequisites p
)
SELECT jsonb_build_object(
  'has_commerce_payment_attempts', has_commerce_payment_attempts,
  'has_user_listings', has_user_listings,
  'has_properties', has_properties,
  'has_auth_uid', has_auth_uid,
  'planned_table_collisions', planned_table_collisions,
  'existing_planned_tables', existing_planned_tables,
  'commerce_wallet_foundation_preflight_pass', (
    has_commerce_payment_attempts
    AND has_user_listings
    AND has_properties
    AND has_auth_uid
    AND planned_table_collisions = 0
  )
) AS commerce_wallet_foundation_preflight
FROM results;
