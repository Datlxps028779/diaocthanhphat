-- =============================================================================
-- Gate 0 corrective RAG projection contract
--
-- Production SQL is run by the user.
-- This migration does not run refresh automatically and does not mutate existing
-- RAG rows until the owner explicitly refreshes a source through the Admin UI.
--
-- It keeps refresh_rag_index_legacy() as the existing source builder, then
-- applies the public projection contract in the owner-MFA wrapper:
--   * public chunks must use absolute https://chonhaviet.com URLs when a public
--     canonical route exists;
--   * property_types are projected only when Search Visibility is eligible;
--   * admin_docs are never retained in rag_chunks;
--   * the wrapper remains owner-MFA only.
--
-- After this migration is applied, deploy the matching application allowlist
-- change before refreshing property_types/news_categories/managed_pages.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_rag_index(target text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result_count integer;
BEGIN
  IF NOT public.is_owner_mfa() THEN
    RAISE EXCEPTION 'Chỉ chủ hệ thống đã xác thực đa yếu tố được đồng bộ dữ liệu AI';
  END IF;

  IF target IS NOT NULL AND target NOT IN (
    'properties', 'news', 'property_types', 'news_categories',
    'neighborhoods', 'areas', 'price_stats', 'managed_pages',
    'ai_chat_knowledge', 'admin_docs'
  ) THEN
    RAISE EXCEPTION 'Nguồn RAG không được hỗ trợ: %', target
      USING ERRCODE = '22023';
  END IF;

  IF target = 'admin_docs' THEN
    DELETE FROM public.rag_chunks
    WHERE source_table = 'admin_docs';

    INSERT INTO public.rag_index_runs (
      source_table, chunks_upserted, chunks_deleted, status, finished_at
    )
    VALUES ('admin_docs', 0, 0, 'ok', now());

    RETURN 0;
  END IF;

  PERFORM public.refresh_rag_index_legacy(target);

  -- Never retain legacy admin document projections, even after a full refresh.
  DELETE FROM public.rag_chunks
  WHERE source_table = 'admin_docs';

  -- Property types are public only when the Search Visibility quality gate says
  -- eligible. The legacy function inserts all valid slugs, so remove the rest
  -- after the source rebuild without touching unrelated source tables.
  IF target IS NULL OR target = 'property_types' THEN
    DELETE FROM public.rag_chunks c
    WHERE c.source_table = 'property_types'
      AND NOT EXISTS (
        SELECT 1
        FROM public.search_visibility_urls sv
        WHERE sv.entity_type = 'property_type'
          AND sv.source_key = 'property_type:' || c.source_id::text
          AND sv.eligible = true
          AND sv.canonical_path IS NOT NULL
      );
  END IF;

  -- Search Visibility is the canonical source for public entity URLs. Use its
  -- absolute URL when available; the fallback paths cover price statistics and
  -- legacy rows that have no registry entity.
  UPDATE public.rag_chunks c
  SET source_url = 'https://chonhaviet.com' || sv.canonical_path
  FROM public.search_visibility_urls sv
  WHERE (target IS NULL OR c.source_table = target)
    AND c.visibility = 'public'
    AND sv.eligible = true
    AND sv.canonical_path IS NOT NULL
    AND (
      (c.source_table = 'properties'
        AND sv.entity_type = 'property'
        AND sv.source_key = 'property:' || c.source_id::text)
      OR (c.source_table = 'news'
        AND sv.entity_type = 'news'
        AND sv.source_key = 'news:' || c.source_id::text)
      OR (c.source_table = 'neighborhoods'
        AND sv.entity_type = 'neighborhood'
        AND sv.source_key = 'neighborhood:' || c.source_id::text)
      OR (c.source_table = 'areas'
        AND sv.entity_type = 'area'
        AND sv.source_key = 'area:' || c.source_id::text)
      OR (c.source_table = 'property_types'
        AND sv.entity_type = 'property_type'
        AND sv.source_key = 'property_type:' || c.source_id::text)
      OR (c.source_table = 'news_categories'
        AND sv.entity_type = 'news_category'
        AND (
          sv.source_key = 'news_category:' || c.source_id::text
          OR sv.source_key = 'news_category:static:' || c.source_slug
        ))
      OR (c.source_table = 'managed_pages'
        AND sv.entity_type = 'managed_page'
        AND sv.source_key = 'managed_page:' || c.source_id::text)
    );

  UPDATE public.rag_chunks
  SET source_url = 'https://chonhaviet.com/du-lieu-gia'
  WHERE (target IS NULL OR source_table = target)
    AND source_table = 'price_stats'
    AND visibility = 'public';

  -- Knowledge rows do not necessarily have a public page. They remain public
  -- grounded facts without a fabricated citation URL.
  SELECT count(*)::integer
  INTO result_count
  FROM public.rag_chunks
  WHERE target IS NULL OR source_table = target;

  RETURN result_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_rag_index(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Read-only post-apply checks (run separately after COMMIT if desired)
-- =============================================================================
-- SELECT has_function_privilege(
--   'authenticated', 'public.refresh_rag_index(text)', 'EXECUTE'
-- );
-- SELECT has_function_privilege(
--   'service_role', 'public.refresh_rag_index(text)', 'EXECUTE'
-- );
