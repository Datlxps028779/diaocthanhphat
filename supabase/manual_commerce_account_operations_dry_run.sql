-- Commerce account and operations read models preflight. READ ONLY.
-- Safe before migrations: absence is reported, not dereferenced.

WITH prerequisites(name, exists) AS (
  VALUES
    ('commerce_orders', to_regclass('public.commerce_orders') IS NOT NULL),
    ('commerce_payment_attempts', to_regclass('public.commerce_payment_attempts') IS NOT NULL),
    ('commerce_entitlements', to_regclass('public.commerce_entitlements') IS NOT NULL),
    ('commerce_notifications', to_regclass('public.commerce_notifications') IS NOT NULL),
    ('commerce_operations_alerts', to_regclass('public.commerce_operations_alerts') IS NOT NULL),
    ('staff_permission_catalog', to_regclass('public.staff_permission_catalog') IS NOT NULL),
    ('has_staff_permission', to_regprocedure('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)') IS NOT NULL)
), planned_functions(name, already_exists) AS (
  VALUES
    ('commerce_get_my_account_snapshot', to_regprocedure('public.commerce_get_my_account_snapshot()') IS NOT NULL),
    ('commerce_mark_notification_read', to_regprocedure('public.commerce_mark_notification_read(uuid)') IS NOT NULL),
    ('commerce_get_operations_alerts', to_regprocedure('public.commerce_get_operations_alerts(text,integer)') IS NOT NULL),
    ('commerce_update_operations_alert_status', to_regprocedure('public.commerce_update_operations_alert_status(uuid,text)') IS NOT NULL)
)
SELECT jsonb_build_object(
  'all_prerequisites_exist', bool_and(p.exists),
  'missing_prerequisites', COALESCE(jsonb_agg(p.name ORDER BY p.name) FILTER (WHERE NOT p.exists), '[]'::jsonb),
  'planned_function_collisions', (
    SELECT COALESCE(jsonb_agg(name ORDER BY name) FILTER (WHERE already_exists), '[]'::jsonb)
    FROM planned_functions
  ),
  'existing_alerts', CASE WHEN to_regclass('public.commerce_operations_alerts') IS NULL THEN NULL ELSE to_jsonb('deferred_until_migration'::text) END,
  'preflight_pass', bool_and(p.exists),
  'measured_at', now()
) AS commerce_account_operations_preflight
FROM prerequisites p;
