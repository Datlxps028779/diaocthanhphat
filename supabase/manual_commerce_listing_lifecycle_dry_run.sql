-- Commerce listing lifecycle enforcement preflight. READ ONLY.
-- Safe before the foundation migration: missing Commerce tables are reported, not queried.

WITH prerequisites(name, exists) AS (
  VALUES
    ('user_listings', to_regclass('public.user_listings') IS NOT NULL),
    ('properties', to_regclass('public.properties') IS NOT NULL),
    ('commerce_entitlements', to_regclass('public.commerce_entitlements') IS NOT NULL),
    ('commerce_quota_reservations', to_regclass('public.commerce_quota_reservations') IS NOT NULL),
    ('commerce_quota_ledger', to_regclass('public.commerce_quota_ledger') IS NOT NULL),
    ('commerce_audit_events', to_regclass('public.commerce_audit_events') IS NOT NULL)
), planned_objects(name, already_exists) AS (
  VALUES
    ('submission_cycle', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'commerce_quota_reservations'
        AND column_name = 'submission_cycle'
    )),
    ('commerce_effective_entitlements', to_regclass('public.commerce_effective_entitlements') IS NOT NULL),
    ('commerce_owner_has_quota_history', to_regprocedure('public.commerce_owner_has_quota_history(uuid)') IS NOT NULL),
    ('commerce_reserve_listing_quota_cycle', to_regprocedure('public.commerce_reserve_listing_quota_cycle(uuid,uuid)') IS NOT NULL),
    ('commerce_consume_listing_quota_cycle', to_regprocedure('public.commerce_consume_listing_quota_cycle(uuid,uuid)') IS NOT NULL),
    ('commerce_close_listing_quota_cycle', to_regprocedure('public.commerce_close_listing_quota_cycle(uuid,uuid,text)') IS NOT NULL),
    ('sync_commerce_listing_entitlement_lifecycle', to_regprocedure('public.sync_commerce_listing_entitlement_lifecycle()') IS NOT NULL)
)
SELECT jsonb_build_object(
  'all_prerequisites_exist', bool_and(p.exists),
  'missing_prerequisites', COALESCE(jsonb_agg(p.name ORDER BY p.name) FILTER (WHERE NOT p.exists), '[]'::jsonb),
  'planned_object_collisions', (
    SELECT COALESCE(jsonb_agg(name ORDER BY name) FILTER (WHERE already_exists), '[]'::jsonb)
    FROM planned_objects
  ),
  'reservation_history', CASE WHEN to_regclass('public.commerce_quota_reservations') IS NULL THEN NULL ELSE to_jsonb('deferred_until_migration'::text) END,
  'enrolled_pending', CASE WHEN to_regclass('public.user_listings') IS NULL OR to_regclass('public.commerce_entitlements') IS NULL THEN NULL ELSE to_jsonb('deferred_until_migration'::text) END,
  'listings_with_duplicate_active_reservations', CASE WHEN to_regclass('public.commerce_quota_reservations') IS NULL THEN NULL ELSE to_jsonb('deferred_until_verify'::text) END,
  'preflight_pass', bool_and(p.exists),
  'measured_at', now()
) AS commerce_listing_lifecycle_preflight
FROM prerequisites p;
