-- Commerce support lookup preflight. READ ONLY.
-- Safe before migrations: absence is reported, not dereferenced.

WITH prerequisites(name, exists) AS (
  VALUES
    ('commerce_operations_alerts', to_regclass('public.commerce_operations_alerts') IS NOT NULL),
    ('commerce_payment_attempts', to_regclass('public.commerce_payment_attempts') IS NOT NULL),
    ('commerce_orders', to_regclass('public.commerce_orders') IS NOT NULL),
    ('commerce_payment_events', to_regclass('public.commerce_payment_events') IS NOT NULL),
    ('commerce_entitlements', to_regclass('public.commerce_entitlements') IS NOT NULL),
    ('commerce_quota_reservations', to_regclass('public.commerce_quota_reservations') IS NOT NULL),
    ('commerce_get_operations_alerts', to_regprocedure('public.commerce_get_operations_alerts(text,integer)') IS NOT NULL),
    ('has_staff_permission', to_regprocedure('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)') IS NOT NULL)
), planned_functions(name, already_exists) AS (
  VALUES
    ('commerce_get_operations_alert_count', to_regprocedure('public.commerce_get_operations_alert_count()') IS NOT NULL),
    ('commerce_get_operations_alert_detail', to_regprocedure('public.commerce_get_operations_alert_detail(uuid)') IS NOT NULL)
)
SELECT jsonb_build_object(
  'all_prerequisites_exist', bool_and(p.exists),
  'missing_prerequisites', COALESCE(jsonb_agg(p.name ORDER BY p.name) FILTER (WHERE NOT p.exists), '[]'::jsonb),
  'planned_function_collisions', (
    SELECT COALESCE(jsonb_agg(name ORDER BY name) FILTER (WHERE already_exists), '[]'::jsonb)
    FROM planned_functions
  ),
  'unresolved_alerts', CASE WHEN to_regclass('public.commerce_operations_alerts') IS NULL THEN NULL ELSE to_jsonb('deferred_until_migration'::text) END,
  'preflight_pass', bool_and(p.exists),
  'measured_at', now()
) AS commerce_support_lookup_preflight
FROM prerequisites p;
