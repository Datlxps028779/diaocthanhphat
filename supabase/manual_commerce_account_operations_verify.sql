-- Commerce account and operations read models post-migration verification. READ ONLY.

WITH expected_functions(name, signature, owner_callable, operations_callable) AS (
  VALUES
    ('commerce_get_my_account_snapshot', 'public.commerce_get_my_account_snapshot()', true, false),
    ('commerce_mark_notification_read', 'public.commerce_mark_notification_read(uuid)', true, false),
    ('commerce_get_operations_alerts', 'public.commerce_get_operations_alerts(text,integer)', false, true),
    ('commerce_update_operations_alert_status', 'public.commerce_update_operations_alert_status(uuid,text)', false, true)
), function_state AS (
  SELECT
    expected.name,
    expected.owner_callable,
    expected.operations_callable,
    p.oid,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM expected_functions expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
), catalog_state AS (
  SELECT module, action
  FROM public.staff_permission_catalog
  WHERE module = 'commerce-operations'
    AND action IN ('view','edit')
), unsafe_alert_grants AS (
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'commerce_operations_alerts'
    AND grantee IN ('anon','authenticated')
), results AS (
  SELECT
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 4
      AND NOT EXISTS (
        SELECT 1 FROM function_state
        WHERE oid IS NULL
           OR NOT prosecdef
           OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
           OR anon_execute
           OR NOT authenticated_execute
      ) AS functions_hardened,
    (SELECT count(*) FROM catalog_state) = 2 AS permission_catalog_present,
    NOT EXISTS (SELECT 1 FROM unsafe_alert_grants) AS operations_alerts_private,
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.commerce_get_my_account_snapshot()')
        AND pg_get_functiondef(p.oid) ILIKE '%owner_user_id = v_actor%'
        AND pg_get_functiondef(p.oid) NOT ILIKE '%provider_metadata%'
        AND pg_get_functiondef(p.oid) NOT ILIKE '%payload_hash%'
    ) AS owner_snapshot_sanitized,
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.commerce_get_operations_alerts(text,integer)')
        AND pg_get_functiondef(p.oid) ILIKE '%commerce-operations%view%'
    ) AND EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.commerce_update_operations_alert_status(uuid,text)')
        AND pg_get_functiondef(p.oid) ILIKE '%commerce-operations%edit%'
    ) AS operations_permissions_present
)
SELECT *,
  functions_hardened
  AND permission_catalog_present
  AND operations_alerts_private
  AND owner_snapshot_sanitized
  AND operations_permissions_present
  AS commerce_account_operations_verify_pass
FROM results;
