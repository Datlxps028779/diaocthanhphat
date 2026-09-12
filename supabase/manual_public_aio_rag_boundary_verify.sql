-- =============================================================================
-- Unified public-to-AIO RAG boundary verification — read-only
--
-- Run after applying 20260911020000_unify_public_aio_rag_boundary.sql.
-- Confirms server-role execution, browser-role denial, canonical citation
-- preference, and property-type grounding in the deployed function.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'refresh_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.refresh_rag_index(text)') IS NOT NULL,
    'security_definer', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'search_path', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN NULL
      ELSE (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('service_role', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'has_service_role_guard', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%auth.role()%service_role%'
    END,
    'prefers_search_visibility_canonical', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%search_visibility_urls%canonical_path%'
    END,
    'uses_owner_mfa_or_service_guard', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%public.is_owner_mfa()%'
    END,
    'includes_property_type_grounding', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%property_type_name%'
    END
  ),
  'rag_chunks_exists', to_regclass('public.rag_chunks') IS NOT NULL,
  'public_source_rows_have_canonical_chunk_urls', NOT EXISTS (
    SELECT 1 FROM public.rag_chunks
    WHERE visibility = 'public'
      AND source_table IN ('properties', 'news', 'areas', 'neighborhoods', 'news_categories', 'managed_pages')
      AND (source_url IS NULL OR source_url !~ '^/[A-Za-z0-9/_-]+$' OR source_url ~ '//')
  ),
  'latest_rag_runs', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.finished_at DESC NULLS LAST)
    FROM (
      SELECT source_table, status, chunks_upserted, chunks_deleted, started_at, finished_at
      FROM public.rag_index_runs
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 10
    ) r
  ), '[]'::jsonb)
) AS public_aio_rag_boundary_verification;

SELECT
  source_table,
  visibility,
  count(*)::integer AS chunk_count,
  max(indexed_at) AS latest_indexed_at
FROM public.rag_chunks
GROUP BY source_table, visibility
ORDER BY source_table, visibility;

ROLLBACK;
