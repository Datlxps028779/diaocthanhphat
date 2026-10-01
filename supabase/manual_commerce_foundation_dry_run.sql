-- Commerce foundation preflight. READ ONLY: safe to run before migration.

WITH prerequisites AS (
  SELECT
    to_regclass('public.user_listings') IS NOT NULL AS has_user_listings,
    to_regclass('public.properties') IS NOT NULL AS has_properties,
    to_regclass('public.profiles') IS NOT NULL AS has_profiles,
    to_regprocedure('auth.uid()') IS NOT NULL AS has_auth_uid
), planned_names(name) AS (
  VALUES
    ('commerce_packages'), ('commerce_package_versions'), ('commerce_orders'),
    ('commerce_order_items'), ('commerce_payment_attempts'), ('commerce_payment_events'),
    ('commerce_webhook_inbox'), ('commerce_refunds'), ('commerce_invoices'),
    ('commerce_subscriptions'), ('commerce_subscription_periods'), ('commerce_entitlements'),
    ('commerce_quota_reservations'),
    ('commerce_quota_ledger'), ('commerce_audit_events'), ('commerce_outbox')
), collisions AS (
  SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS already_exists
  FROM planned_names
)
SELECT
  p.*,
  (SELECT count(*) FROM collisions WHERE already_exists) AS planned_table_collisions,
  (SELECT coalesce(jsonb_agg(name ORDER BY name), '[]'::jsonb) FROM collisions WHERE already_exists) AS existing_planned_tables,
  (p.has_user_listings AND p.has_properties AND p.has_profiles AND p.has_auth_uid) AS prerequisites_pass
FROM prerequisites p;

SELECT status, count(*) AS listing_count
FROM public.user_listings
GROUP BY status
ORDER BY status;

SELECT
  count(*) FILTER (WHERE property_id IS NULL) AS listings_without_property,
  count(*) FILTER (WHERE user_id IS NULL) AS listings_without_owner,
  count(*) AS total_listings
FROM public.user_listings;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('user_listings','properties','profiles')
ORDER BY c.relname;
