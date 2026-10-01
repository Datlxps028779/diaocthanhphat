-- Commerce email delivery preflight. READ ONLY.
-- Safe before migrations: absence is reported, not dereferenced.

WITH prerequisites(name, exists) AS (
  VALUES
    ('commerce_notifications', to_regclass('public.commerce_notifications') IS NOT NULL),
    ('commerce_outbox', to_regclass('public.commerce_outbox') IS NOT NULL),
    ('commerce_operations_alerts', to_regclass('public.commerce_operations_alerts') IS NOT NULL),
    ('commerce_payment_attempts', to_regclass('public.commerce_payment_attempts') IS NOT NULL),
    ('auth_users', to_regclass('auth.users') IS NOT NULL),
    ('has_staff_permission', to_regprocedure('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)') IS NOT NULL)
), planned_objects(name, already_exists) AS (
  VALUES
    ('commerce_email_deliveries', to_regclass('public.commerce_email_deliveries') IS NOT NULL),
    ('commerce_claim_email_deliveries', to_regprocedure('public.commerce_claim_email_deliveries(integer)') IS NOT NULL),
    ('commerce_complete_email_delivery', to_regprocedure('public.commerce_complete_email_delivery(uuid,uuid,text)') IS NOT NULL),
    ('commerce_fail_email_delivery', to_regprocedure('public.commerce_fail_email_delivery(uuid,uuid,text,boolean,text)') IS NOT NULL),
    ('commerce_get_operations_alert_email_deliveries', to_regprocedure('public.commerce_get_operations_alert_email_deliveries(uuid)') IS NOT NULL)
)
SELECT jsonb_build_object(
  'all_prerequisites_exist', bool_and(p.exists),
  'missing_prerequisites', COALESCE(jsonb_agg(p.name ORDER BY p.name) FILTER (WHERE NOT p.exists), '[]'::jsonb),
  'planned_object_collisions', (
    SELECT COALESCE(jsonb_agg(name ORDER BY name) FILTER (WHERE already_exists), '[]'::jsonb)
    FROM planned_objects
  ),
  'notifications_without_email', CASE WHEN to_regclass('public.commerce_notifications') IS NULL THEN NULL ELSE to_jsonb('deferred_until_migration'::text) END,
  'preflight_pass', bool_and(p.exists),
  'measured_at', now()
) AS commerce_email_delivery_preflight
FROM prerequisites p;
