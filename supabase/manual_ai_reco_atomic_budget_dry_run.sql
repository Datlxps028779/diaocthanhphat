-- Read-only verification for 20260911000000_ai_reco_atomic_budget.sql
-- Safe to run in production before/after deployment; performs no writes.

SELECT
  to_regclass('public.ai_reco_budget_buckets') AS budget_table,
  to_regprocedure('public.reserve_ai_reco_budget()') AS reserve_function;

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  pg_get_function_result(p.oid) AS result_type,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'reserve_ai_reco_budget';

SELECT
  bucket_type,
  bucket_start,
  request_count
FROM public.ai_reco_budget_buckets
ORDER BY bucket_start DESC, bucket_type
LIMIT 20;
