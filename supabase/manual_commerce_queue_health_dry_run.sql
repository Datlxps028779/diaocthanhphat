-- Commerce queue health preflight. READ ONLY.
-- Run before applying 20261015030000_commerce_queue_health.sql.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_outbox') IS NOT NULL AS outbox_present,
    to_regclass('public.commerce_email_deliveries') IS NOT NULL AS email_present,
    to_regprocedure('public.commerce_get_operations_queue_health()') IS NULL AS function_available,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'has_staff_permission'
        AND pg_get_function_identity_arguments(p.oid) = 'p_module text, p_action text, p_area_id uuid, p_district_id uuid, p_ward_id uuid, p_neighborhood_id uuid'
        AND p.pronargdefaults = 4
    ) AS permission_helper_present,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('commerce_outbox', 'commerce_email_deliveries')
        AND column_name IN ('status', 'next_attempt_at', 'created_at')
      GROUP BY table_name
      HAVING count(*) = 3
    ) AS queue_columns_present
)
SELECT jsonb_build_object(
  'outbox_present', outbox_present,
  'email_present', email_present,
  'function_available', function_available,
  'permission_helper_present', permission_helper_present,
  'queue_columns_present', queue_columns_present,
  'commerce_queue_health_preflight', (
    outbox_present
    AND email_present
    AND function_available
    AND permission_helper_present
    AND queue_columns_present
  )
)
FROM prerequisites;
