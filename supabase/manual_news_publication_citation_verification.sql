-- =============================================================================
-- P8 verification: production read-only check after migration
-- =============================================================================
-- Run this in the Supabase SQL Editor AFTER
-- 20260905000000_guard_news_publication_citations.sql has succeeded.
-- This deliberately returns ONE JSON row because the SQL Editor normally renders
-- only the final SELECT result. It never changes data.

BEGIN TRANSACTION READ ONLY;

WITH trigger_check AS (
  SELECT jsonb_build_object(
    'exists', count(*) = 1,
    'name', max(t.tgname),
    'enabled_state', max(t.tgenabled)::text,
    'definition', max(pg_get_triggerdef(t.oid))
  ) AS value
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'news'
    AND t.tgname = 'trg_guard_news_publication_citations'
    AND NOT t.tgisinternal
), function_check AS (
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'name', p.proname,
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'public_can_execute', has_function_privilege('public', p.oid, 'execute'),
      'anon_can_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'execute')
    )
    ORDER BY p.proname
  ), '[]'::jsonb) AS value
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'news_has_publication_citations',
      'guard_news_publication_citations'
    )
), legacy_check AS (
  SELECT jsonb_build_object(
    'published_total', count(*),
    'published_legacy_citation_gate_fail', count(*) FILTER (
      WHERE NOT public.news_has_publication_citations(citations)
    ),
    'published_citation_gate_pass', count(*) FILTER (
      WHERE public.news_has_publication_citations(citations)
    )
  ) AS value
  FROM public.news
  WHERE is_published
), policy_check AS (
  SELECT jsonb_build_object(
    'missing_citations_passes_gate',
      public.news_has_publication_citations('[]'::jsonb),
    'two_unique_sources_pass_gate',
      public.news_has_publication_citations(
        jsonb_build_array(
          jsonb_build_object('title', 'Nguồn A', 'url', 'https://example.gov.vn/a'),
          jsonb_build_object('title', 'Nguồn B', 'url', 'https://example.gov.vn/b')
        )
      ),
    'duplicate_source_passes_gate',
      public.news_has_publication_citations(
        jsonb_build_array(
          jsonb_build_object('title', 'Nguồn A', 'url', 'https://example.gov.vn/a'),
          jsonb_build_object('title', 'Nguồn B', 'url', 'https://example.gov.vn/a')
        )
      )
  ) AS value
)
SELECT jsonb_build_object(
  'trigger', trigger_check.value,
  'functions', function_check.value,
  'legacy', legacy_check.value,
  'policy', policy_check.value
) AS verification
FROM trigger_check, function_check, legacy_check, policy_check;

ROLLBACK;
