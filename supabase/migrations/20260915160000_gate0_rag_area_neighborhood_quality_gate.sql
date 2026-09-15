-- =============================================================================
-- Gate 0 follow-up: quality-gate area and neighborhood RAG projections
--
-- Production SQL is run by the user.
-- Remove only public RAG chunks whose Search Visibility entity is not eligible.
-- Source rows remain untouched. Eligible rows keep their canonical absolute URL
-- through the existing wrapper projection.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  function_definition text;
  insertion text := $projection$
  -- Area and neighborhood pages are public only when Search Visibility is eligible.
  IF target IS NULL OR target = 'areas' THEN
    DELETE FROM public.rag_chunks c
    WHERE c.source_table = 'areas'
      AND c.visibility = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM public.search_visibility_urls sv
        WHERE sv.entity_type = 'area'
          AND sv.source_key = 'area:' || c.source_id::text
          AND sv.eligible = true
          AND sv.canonical_path IS NOT NULL
      );
  END IF;

  IF target IS NULL OR target = 'neighborhoods' THEN
    DELETE FROM public.rag_chunks c
    WHERE c.source_table = 'neighborhoods'
      AND c.visibility = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM public.search_visibility_urls sv
        WHERE sv.entity_type = 'neighborhood'
          AND sv.source_key = 'neighborhood:' || c.source_id::text
          AND sv.eligible = true
          AND sv.canonical_path IS NOT NULL
      );
  END IF;

$projection$;
BEGIN
  IF to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy public.refresh_rag_index(text)';
  END IF;

  SELECT pg_get_functiondef('public.refresh_rag_index(text)'::regprocedure)
  INTO function_definition;

  IF position('-- Area and neighborhood pages are public only when Search Visibility is eligible.' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'Quality gate area/neighborhood đã tồn tại; dừng để tránh chèn trùng';
  END IF;

  IF position('  -- Property types are public only when the Search Visibility quality gate says' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Wrapper RAG không khớp mẫu đã kiểm định; dừng để tránh thay thế mù';
  END IF;

  function_definition := replace(
    function_definition,
    '  -- Property types are public only when the Search Visibility quality gate says',
    insertion || E'\n  -- Property types are public only when the Search Visibility quality gate says'
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Sau khi migration chạy, refresh riêng areas và neighborhoods trên Admin UI.
