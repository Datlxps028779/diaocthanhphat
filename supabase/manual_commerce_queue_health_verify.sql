-- Commerce queue health verification. READ ONLY.
-- Run after 20261015030000_commerce_queue_health.sql.

WITH target_function AS (
  SELECT
    p.oid,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.commerce_get_operations_queue_health()')
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('commerce_outbox', 'commerce_email_deliveries')
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
), results AS (
  SELECT
    (SELECT count(*) = 1
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(authenticated_execute)
      AND bool_and(NOT anon_execute)
      AND bool_and(definition LIKE '%has_staff_permission(''commerce-operations'', ''view'')%')
      AND bool_and(definition LIKE '%oldest_actionable_at%')
      AND bool_and(definition LIKE '%pending%')
      AND bool_and(definition LIKE '%processing%')
      AND bool_and(definition LIKE '%retry%')
      AND bool_and(definition LIKE '%dead_letter%')
      AND bool_and(definition LIKE '%sent%')
      FROM target_function) AS function_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    to_regclass('public.commerce_outbox') IS NOT NULL
      AND to_regclass('public.commerce_email_deliveries') IS NOT NULL AS queue_tables_present
)
SELECT jsonb_build_object(
  'function_hardened', function_hardened,
  'no_client_table_grants', no_client_table_grants,
  'queue_tables_present', queue_tables_present,
  'commerce_queue_health_verify_pass', (
    function_hardened
    AND no_client_table_grants
    AND queue_tables_present
  )
)
FROM results;
