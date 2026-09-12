-- =============================================================================
-- Unified indexing Gate 0 — one-row summary, read-only
--
-- Use this when Supabase SQL Editor only displays the last result set.
-- It returns ONE JSON row containing environment, source counts, Search
-- Visibility, RAG chunks/runs, freshness jobs, and active AI knowledge.
-- Does NOT write, rebuild, submit sitemap, call Google, or change privileges.
-- Production SQL is run by the user.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH source_counts AS (
  SELECT 'properties'::text AS source_table, count(*)::integer AS source_rows
  FROM public.properties p
  WHERE p.is_active = true
    AND p.public_code IS NOT NULL AND p.public_code > 0
    AND btrim(coalesce(p.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND p.listing_type::text IN ('mua_ban', 'cho_thue')
    AND EXISTS (
      SELECT 1 FROM public.areas a
      WHERE a.id = p.area_id
        AND btrim(coalesce(a.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  UNION ALL
  SELECT 'news', count(*)::integer
  FROM public.news n
  WHERE n.is_published = true
    AND btrim(coalesce(n.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'areas', count(*)::integer
  FROM public.areas a
  WHERE btrim(coalesce(a.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'neighborhoods', count(*)::integer
  FROM public.neighborhoods nh
  WHERE btrim(coalesce(nh.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'property_types', count(*)::integer
  FROM public.property_types pt
  WHERE btrim(coalesce(pt.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'news_categories', count(*)::integer
  FROM public.news_categories nc
  WHERE btrim(coalesce(nc.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'managed_pages', count(*)::integer
  FROM public.managed_pages mp
  WHERE mp.is_active = true
    AND mp.is_system = false
    AND btrim(coalesce(mp.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  UNION ALL
  SELECT 'price_stats', count(*)::integer
  FROM public.price_stats ps
  WHERE ps.property_type_id IS NULL
    AND ps.sample_count >= 3
    AND btrim(coalesce(ps.scope_key, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
), registry_counts AS (
  SELECT
    entity_type,
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE eligible = true)::integer AS eligible_rows,
    count(*) FILTER (WHERE eligible IS DISTINCT FROM true)::integer AS excluded_rows,
    max(updated_at) AS latest_updated_at
  FROM public.search_visibility_urls
  GROUP BY entity_type
), rag_counts AS (
  SELECT
    source_table,
    visibility,
    count(*)::integer AS chunk_count,
    max(indexed_at) AS latest_indexed_at
  FROM public.rag_chunks
  GROUP BY source_table, visibility
), freshness_counts AS (
  SELECT
    status,
    count(*)::integer AS job_count,
    min(created_at) AS oldest_created_at,
    max(created_at) AS latest_created_at,
    max(processed_at) AS latest_processed_at
  FROM public.seo_freshness_jobs
  GROUP BY status
), rag_runs AS (
  SELECT
    source_table,
    status,
    count(*)::integer AS run_count,
    max(started_at) AS latest_started_at,
    max(finished_at) AS latest_finished_at,
    sum(chunks_upserted)::integer AS total_chunks_upserted,
    sum(chunks_deleted)::integer AS total_chunks_deleted
  FROM public.rag_index_runs
  GROUP BY source_table, status
), active_knowledge AS (
  SELECT
    k.id,
    k.topic,
    k.is_active,
    to_jsonb(k)->>'knowledge_type' AS knowledge_type
  FROM public.ai_chat_knowledge k
  WHERE k.is_active = true
  ORDER BY k.topic, k.id
  LIMIT 100
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'environment', jsonb_build_object(
    'tables', jsonb_build_object(
      'properties', to_regclass('public.properties') IS NOT NULL,
      'user_listings', to_regclass('public.user_listings') IS NOT NULL,
      'news', to_regclass('public.news') IS NOT NULL,
      'areas', to_regclass('public.areas') IS NOT NULL,
      'districts', to_regclass('public.districts') IS NOT NULL,
      'wards', to_regclass('public.wards') IS NOT NULL,
      'neighborhoods', to_regclass('public.neighborhoods') IS NOT NULL,
      'property_types', to_regclass('public.property_types') IS NOT NULL,
      'news_categories', to_regclass('public.news_categories') IS NOT NULL,
      'managed_pages', to_regclass('public.managed_pages') IS NOT NULL,
      'page_blocks', to_regclass('public.page_blocks') IS NOT NULL,
      'price_stats', to_regclass('public.price_stats') IS NOT NULL,
      'ai_chat_knowledge', to_regclass('public.ai_chat_knowledge') IS NOT NULL,
      'search_visibility_urls', to_regclass('public.search_visibility_urls') IS NOT NULL,
      'seo_freshness_jobs', to_regclass('public.seo_freshness_jobs') IS NOT NULL,
      'rag_chunks', to_regclass('public.rag_chunks') IS NOT NULL,
      'rag_index_runs', to_regclass('public.rag_index_runs') IS NOT NULL
    ),
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
      END
    )
  ),
  'source_rows', coalesce((
    SELECT jsonb_object_agg(source_table, source_rows)
    FROM source_counts
  ), '{}'::jsonb),
  'search_visibility', coalesce((
    SELECT jsonb_object_agg(entity_type, jsonb_build_object(
      'total_rows', total_rows,
      'eligible_rows', eligible_rows,
      'excluded_rows', excluded_rows,
      'latest_updated_at', latest_updated_at
    ))
    FROM registry_counts
  ), '{}'::jsonb),
  'rag_chunks', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.source_table, r.visibility)
    FROM rag_counts r
  ), '[]'::jsonb),
  'rag_runs', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.latest_finished_at DESC NULLS LAST)
    FROM rag_runs r
  ), '[]'::jsonb),
  'freshness_jobs', coalesce((
    SELECT jsonb_agg(row_to_json(f) ORDER BY f.status)
    FROM freshness_counts f
  ), '[]'::jsonb),
  'ai_chat_knowledge', jsonb_build_object(
    'knowledge_type_column_exists', EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_chat_knowledge'
        AND column_name = 'knowledge_type'
    ),
    'active_rows', coalesce((
      SELECT jsonb_agg(row_to_json(k) ORDER BY k.topic, k.id)
      FROM active_knowledge k
    ), '[]'::jsonb)
  )
) AS unified_indexing_gate0_summary;

ROLLBACK;
