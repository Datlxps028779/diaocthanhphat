-- =============================================================================
-- Unified public-to-AIO RAG boundary preflight — read-only
--
-- Run before installing 20260911020000_unify_public_aio_rag_boundary.sql.
-- Does not write data or change privileges. Production SQL is run by the user.
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
    'uses_owner_mfa_or_service_guard', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%public.is_owner_mfa()%'
    END,
    'prefers_search_visibility_canonical', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%search_visibility_urls%canonical_path%'
    END
  ),
  'rag_chunks_exists', to_regclass('public.rag_chunks') IS NOT NULL,
  'search_visibility_exists', to_regclass('public.search_visibility_urls') IS NOT NULL,
  'required_source_columns', jsonb_build_object(
    'property_types', to_regclass('public.property_types') IS NOT NULL,
    'news_categories', to_regclass('public.news_categories') IS NOT NULL,
    'managed_pages', to_regclass('public.managed_pages') IS NOT NULL,
    'page_blocks', to_regclass('public.page_blocks') IS NOT NULL,
    'admin_documents_file_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_documents' AND column_name = 'file_path')
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
) AS public_aio_rag_boundary_preflight;

ROLLBACK;
