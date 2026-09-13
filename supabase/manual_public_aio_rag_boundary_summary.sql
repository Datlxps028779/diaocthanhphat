-- =============================================================================
-- Public AIO/RAG boundary — one-row summary, read-only
--
-- Use this when Supabase SQL Editor only shows the final result set. It returns
-- ONE JSON row with refresh RPC guard/ACL, public chunk URL integrity, chunk
-- distribution, latest runs and source-table/schema availability.
--
-- This script does not rebuild RAG, call Google, change privileges or mutate
-- production. Production SQL is run by the user.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH rpc AS (
  SELECT to_regprocedure('public.refresh_rag_index(text)') AS oid
), rpc_check AS (
  SELECT
    r.oid IS NOT NULL AS rpc_exists,
    coalesce((SELECT prosecdef FROM pg_proc WHERE oid = r.oid), false) AS security_definer,
    (SELECT proconfig FROM pg_proc WHERE oid = r.oid) AS search_path,
    CASE WHEN r.oid IS NULL THEN false ELSE has_function_privilege('anon', r.oid, 'EXECUTE') END AS anon_can_execute,
    CASE WHEN r.oid IS NULL THEN false ELSE has_function_privilege('authenticated', r.oid, 'EXECUTE') END AS authenticated_can_execute,
    CASE WHEN r.oid IS NULL THEN false ELSE has_function_privilege('service_role', r.oid, 'EXECUTE') END AS service_role_can_execute,
    CASE WHEN r.oid IS NULL THEN false ELSE pg_get_functiondef(r.oid) LIKE '%coalesce(auth.role(), '''') = ''service_role''%' END AS service_role_guard,
    CASE WHEN r.oid IS NULL THEN false ELSE pg_get_functiondef(r.oid) LIKE '%public.is_owner_mfa()%' END AS owner_mfa_guard_preserved,
    CASE WHEN r.oid IS NULL THEN false ELSE pg_get_functiondef(r.oid) LIKE '%search_visibility_urls%canonical_path%' END AS prefers_search_visibility_canonical,
    CASE WHEN r.oid IS NULL THEN false ELSE pg_get_functiondef(r.oid) LIKE '%property_type_name%' END AS includes_property_type_grounding
  FROM rpc r
), chunk_counts AS (
  SELECT
    source_table,
    visibility,
    count(*)::integer AS chunk_count,
    max(indexed_at) AS latest_indexed_at
  FROM public.rag_chunks
  GROUP BY source_table, visibility
), latest_runs AS (
  SELECT source_table, status, chunks_upserted, chunks_deleted, started_at, finished_at
  FROM public.rag_index_runs
  ORDER BY finished_at DESC NULLS LAST
  LIMIT 10
), source_tables AS (
  SELECT key AS table_name, to_regclass(format('public.%s', key)) IS NOT NULL AS table_exists
  FROM jsonb_each_text('{"properties":"","news":"","areas":"","neighborhoods":"","news_categories":"","managed_pages":"","property_types":"","page_blocks":"","search_visibility_urls":"","rag_chunks":"","rag_index_runs":"","ai_chat_knowledge":""}'::jsonb)
), public_chunk_integrity AS (
  SELECT count(*)::integer AS invalid_count
  FROM public.rag_chunks
  WHERE visibility = 'public'
    AND source_table IN ('properties', 'news', 'areas', 'neighborhoods', 'news_categories', 'managed_pages')
    AND (source_url IS NULL OR source_url !~ '^/[A-Za-z0-9/_-]+$' OR source_url ~ '//')
), knowledge_schema AS (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_chat_knowledge'
      AND column_name = 'knowledge_type'
  ) AS knowledge_type_column_exists
)
SELECT jsonb_build_object(
  'refresh_rpc', (SELECT to_jsonb(c) FROM rpc_check c),
  'deferred_browser_acl_ok', (
    (SELECT rpc_exists FROM rpc_check)
    AND NOT (SELECT anon_can_execute FROM rpc_check)
    AND NOT (SELECT authenticated_can_execute FROM rpc_check)
    AND (SELECT service_role_can_execute FROM rpc_check)
  ),
  'public_aio_boundary_contract_ok', (
    (SELECT rpc_exists FROM rpc_check)
    AND (SELECT service_role_guard FROM rpc_check)
    AND (SELECT owner_mfa_guard_preserved FROM rpc_check)
    AND (SELECT prefers_search_visibility_canonical FROM rpc_check)
    AND (SELECT invalid_count FROM public_chunk_integrity) = 0
  ),
  'source_tables', coalesce((
    SELECT jsonb_object_agg(table_name, table_exists ORDER BY table_name)
    FROM source_tables
  ), '{}'::jsonb),
  'knowledge_schema', (SELECT row_to_json(k) FROM knowledge_schema k),
  'public_chunk_url_integrity', jsonb_build_object(
    'invalid_public_source_url_rows', (SELECT invalid_count FROM public_chunk_integrity),
    'ok', (SELECT invalid_count FROM public_chunk_integrity) = 0
  ),
  'rag_chunks', coalesce((
    SELECT jsonb_agg(row_to_json(c) ORDER BY c.source_table, c.visibility)
    FROM chunk_counts c
  ), '[]'::jsonb),
  'latest_rag_runs', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.finished_at DESC NULLS LAST)
    FROM latest_runs r
  ), '[]'::jsonb)
) AS public_aio_rag_boundary_summary;

ROLLBACK;
