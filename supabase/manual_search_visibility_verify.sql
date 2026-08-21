-- =============================================================================
-- Search Visibility foundation — production read-only verification
--
-- Run only after 20260906000000_search_visibility_audit_foundation.sql succeeds.
-- This script never writes, schedules, contacts Google, or submits a sitemap.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'select') AS anon_can_select,
  has_table_privilege('authenticated', c.oid, 'insert') AS authenticated_can_insert,
  has_table_privilege('authenticated', c.oid, 'update') AS authenticated_can_update,
  has_table_privilege('authenticated', c.oid, 'delete') AS authenticated_can_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('search_visibility_urls', 'search_visibility_runs')
ORDER BY c.relname;

SELECT
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('search_visibility_urls', 'search_visibility_runs')
ORDER BY tablename, policyname;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('search_visibility_urls', 'search_visibility_runs')
ORDER BY tablename, indexname;

SELECT jsonb_build_object(
  'url_rows', (SELECT count(*) FROM public.search_visibility_urls),
  'eligible_rows', (SELECT count(*) FROM public.search_visibility_urls WHERE eligible),
  'excluded_rows', (SELECT count(*) FROM public.search_visibility_urls WHERE NOT eligible),
  'google_evidence_rows', (SELECT count(*) FROM public.search_visibility_urls WHERE evidence_observed_at IS NOT NULL),
  'runs', (SELECT count(*) FROM public.search_visibility_runs),
  'note', 'A zero Google-evidence count is expected: this foundation does not call Google APIs.'
) AS search_visibility_foundation_state;

ROLLBACK;
