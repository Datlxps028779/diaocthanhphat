-- =============================================================================
-- Gate 0 source-to-RAG reconciliation — read-only
--
-- Production SQL is run by the user. This script only reads metadata and rows.
-- It does not refresh, rebuild, mutate data, or change privileges.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1. Confirm the deployed refresh function branches. This is the source of truth
--    for whether a table is actually refreshable through the RPC.
SELECT jsonb_build_object(
  'function', 'public.refresh_rag_index(text)',
  'exists', to_regprocedure('public.refresh_rag_index(text)') IS NOT NULL,
  'definition', CASE
    WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN NULL
    ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
  END
) AS refresh_function_contract;

-- 2. Property types: source rows, active listing signals, Search Visibility
--    registry rows, and any RAG chunk. RAG chunks are expected only if the
--    deployed function has an explicit property_types branch.
SELECT jsonb_build_object(
  'property_type_id', pt.id,
  'name', pt.name,
  'slug', pt.slug,
  'active_listing_count', (
    SELECT count(*)::integer
    FROM public.properties p
    WHERE p.is_active = true AND p.property_type_id = pt.id
  ),
  'distinct_area_count', (
    SELECT count(DISTINCT p.area_id)::integer
    FROM public.properties p
    WHERE p.is_active = true
      AND p.property_type_id = pt.id
      AND nullif(trim(p.area_id::text), '') IS NOT NULL
  ),
  'distinct_district_count', (
    SELECT count(DISTINCT p.district_id)::integer
    FROM public.properties p
    WHERE p.is_active = true
      AND p.property_type_id = pt.id
      AND nullif(trim(p.district_id::text), '') IS NOT NULL
  ),
  'search_visibility_rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_key', s.source_key,
      'entity_type', s.entity_type,
      'entity_id', s.entity_id,
      'canonical_path', s.canonical_path,
      'canonical_url', s.canonical_url,
      'eligible', s.eligible,
      'reason_code', s.reason_code
    ) ORDER BY s.source_key)
    FROM public.search_visibility_urls s
    WHERE s.entity_type = 'property_type' AND s.entity_id = pt.id::text
  ), '[]'::jsonb),
  'rag_chunks', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_table', c.source_table,
      'source_id', c.source_id,
      'source_slug', c.source_slug,
      'source_url', c.source_url,
      'title', c.title,
      'visibility', c.visibility,
      'indexed_at', c.indexed_at
    ) ORDER BY c.source_table, c.source_id, c.chunk_index)
    FROM public.rag_chunks c
    WHERE c.source_id = pt.id
      AND c.source_table IN ('property_types', 'property_type')
  ), '[]'::jsonb)
) AS property_type_reconciliation
FROM public.property_types pt
ORDER BY pt.slug, pt.id;

-- 3. Managed pages: classify every source row and show registry/chunk
--    projections. The current refresh function migration has no managed_pages
--    branch, so any chunk here must have another explicit production origin.
SELECT jsonb_build_object(
  'managed_page_id', mp.id,
  'slug', mp.slug,
  'is_active', mp.is_active,
  'is_system', mp.is_system,
  'updated_at', mp.updated_at,
  'expected_search_visibility', CASE
    WHEN NOT mp.is_active OR mp.is_system THEN 'excluded'
    WHEN nullif(trim(mp.slug), '') IS NULL THEN 'excluded'
    ELSE 'eligible'
  END,
  'search_visibility_rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_key', s.source_key,
      'entity_type', s.entity_type,
      'entity_id', s.entity_id,
      'canonical_path', s.canonical_path,
      'canonical_url', s.canonical_url,
      'eligible', s.eligible,
      'reason_code', s.reason_code
    ) ORDER BY s.source_key)
    FROM public.search_visibility_urls s
    WHERE s.entity_type = 'managed_page' AND s.entity_id = mp.id::text
  ), '[]'::jsonb),
  'rag_chunks', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_table', c.source_table,
      'source_id', c.source_id,
      'source_slug', c.source_slug,
      'source_url', c.source_url,
      'title', c.title,
      'visibility', c.visibility,
      'indexed_at', c.indexed_at
    ) ORDER BY c.source_table, c.source_id, c.chunk_index)
    FROM public.rag_chunks c
    WHERE c.source_id = mp.id
      AND c.source_table IN ('managed_pages', 'managed_page')
  ), '[]'::jsonb)
) AS managed_page_reconciliation
FROM public.managed_pages mp
ORDER BY mp.slug, mp.id;

-- 4. Detect RAG rows whose source_table names imply unsupported projections.
SELECT source_table, count(*)::integer AS chunk_count,
       count(*) FILTER (WHERE visibility = 'public')::integer AS public_chunk_count
FROM public.rag_chunks
WHERE source_table IN ('property_types', 'property_type', 'news_categories', 'news_category', 'managed_pages', 'managed_page')
GROUP BY source_table
ORDER BY source_table;

-- 5. News stale-row check from Gate 0. This identifies whether the exact
--    published source is still absent or has been repaired.
SELECT jsonb_build_object(
  'source_id', n.id,
  'slug', n.slug,
  'is_published', n.is_published,
  'updated_at', n.updated_at,
  'rag_chunk_count', (
    SELECT count(*)::integer
    FROM public.rag_chunks c
    WHERE c.source_table = 'news' AND c.source_id = n.id
  ),
  'rag_chunks', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_url', c.source_url,
      'content_hash', c.content_hash,
      'indexed_at', c.indexed_at,
      'visibility', c.visibility
    ) ORDER BY c.chunk_index)
    FROM public.rag_chunks c
    WHERE c.source_table = 'news' AND c.source_id = n.id
  ), '[]'::jsonb)
) AS news_stale_projection
FROM public.news n
WHERE n.id = 'f551d52c-3927-4d02-83a0-8cdb5996d365'::uuid;

ROLLBACK;
