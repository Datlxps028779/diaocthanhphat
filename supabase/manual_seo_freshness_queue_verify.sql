-- =============================================================================
-- SEO freshness queue verification — read-only
--
-- Run after applying 20260909010000_seo_freshness_queue.sql.
-- This does not claim or mutate jobs.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT
  to_regclass('public.seo_freshness_jobs') AS queue_table,
  to_regprocedure('public.claim_seo_freshness_jobs(text,integer)') AS claim_function,
  to_regprocedure('public.complete_seo_freshness_job(uuid,text,boolean,text)') AS complete_function;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS row_level_security_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_can_select
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'seo_freshness_jobs';

SELECT
  p.oid::regprocedure AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid IN (
    to_regprocedure('public.claim_seo_freshness_jobs(text,integer)'),
    to_regprocedure('public.complete_seo_freshness_job(uuid,text,boolean,text)')
  );

SELECT
  status,
  count(*)::integer AS job_count,
  min(created_at) AS oldest_created_at,
  min(next_attempt_at) FILTER (WHERE status IN ('pending', 'failed')) AS next_attempt_at
FROM public.seo_freshness_jobs
GROUP BY status
ORDER BY status;

ROLLBACK;
