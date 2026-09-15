-- =============================================================================
-- Gate 0 follow-up: project taxonomy sources from real tables
--
-- Production SQL is run by the user.
-- The deployed legacy builder predates property_types, news_categories, and
-- managed_pages. It can therefore delete property_type chunks without rebuilding
-- them, and it leaves old relative URLs for taxonomy chunks. This migration adds
-- only the missing source projections inside the existing guarded wrapper.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  function_definition text;
  insertion text := $projection$
  -- TAXONOMY PROJECTIONS omitted by the legacy builder.
  IF target IS NULL OR target = 'property_types' THEN
    INSERT INTO public.rag_chunks (
      source_table, source_id, source_slug, source_url, title, chunk_index,
      content, metadata, visibility, content_hash
    )
    SELECT
      'property_types', pt.id, pt.slug,
      'https://chonhaviet.com/loai-nha-dat/' || pt.slug,
      pt.name, 0,
      concat_ws(E'\n', pt.name, 'Danh mục bất động sản: ' || pt.name),
      jsonb_strip_nulls(jsonb_build_object('slug', pt.slug, 'name', pt.name)),
      'public',
      md5(coalesce(pt.id::text, '') || coalesce(pt.name, '') || coalesce(pt.slug, ''))
    FROM public.property_types pt
    WHERE EXISTS (
      SELECT 1
      FROM public.search_visibility_urls sv
      WHERE sv.entity_type = 'property_type'
        AND sv.source_key = 'property_type:' || pt.id::text
        AND sv.eligible = true
        AND sv.canonical_path IS NOT NULL
    )
    ON CONFLICT (source_table, source_id, chunk_index) DO UPDATE
    SET source_slug = EXCLUDED.source_slug,
        source_url = EXCLUDED.source_url,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        visibility = EXCLUDED.visibility,
        content_hash = EXCLUDED.content_hash,
        indexed_at = now();
  END IF;

  IF target IS NULL OR target = 'news_categories' THEN
    INSERT INTO public.rag_chunks (
      source_table, source_id, source_slug, source_url, title, chunk_index,
      content, metadata, visibility, content_hash
    )
    SELECT
      'news_categories', nc.id, nc.slug,
      'https://chonhaviet.com/tin-tuc/danh-muc/' || nc.slug,
      nc.label, 0,
      concat_ws(E'\n', nc.label, nullif(nc.seo_description, '')),
      jsonb_strip_nulls(jsonb_build_object(
        'label', nc.label, 'slug', nc.slug
      )),
      'public',
      md5(coalesce(nc.id::text, '') || coalesce(nc.label, '') || coalesce(nc.slug, '') || coalesce(nc.seo_description, ''))
    FROM public.news_categories nc
    ON CONFLICT (source_table, source_id, chunk_index) DO UPDATE
    SET source_slug = EXCLUDED.source_slug,
        source_url = EXCLUDED.source_url,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        visibility = EXCLUDED.visibility,
        content_hash = EXCLUDED.content_hash,
        indexed_at = now();
  END IF;

  IF target IS NULL OR target = 'managed_pages' THEN
    INSERT INTO public.rag_chunks (
      source_table, source_id, source_slug, source_url, title, chunk_index,
      content, metadata, visibility, content_hash
    )
    SELECT
      'managed_pages', mp.id, mp.slug,
      'https://chonhaviet.com/trang/' || mp.slug,
      mp.title, 0,
      concat_ws(
        E'\n',
        mp.title,
        nullif(mp.description, ''),
        (
          SELECT string_agg(
            concat_ws(': ', nullif(pb.label, ''), left(regexp_replace(coalesce(pb.value, ''), '<[^>]+>', ' ', 'g'), 3000)),
            E'\n' ORDER BY pb.order_index
          )
          FROM public.page_blocks pb
          WHERE pb.page_slug = mp.slug
        )
      ),
      jsonb_strip_nulls(jsonb_build_object('slug', mp.slug, 'title', mp.title)),
      'public',
      md5(coalesce(mp.id::text, '') || coalesce(mp.slug, '') || coalesce(mp.title, '') || coalesce(mp.description, '') || coalesce(mp.updated_at::text, ''))
    FROM public.managed_pages mp
    WHERE mp.is_active = true
      AND mp.is_system = false
    ON CONFLICT (source_table, source_id, chunk_index) DO UPDATE
    SET source_slug = EXCLUDED.source_slug,
        source_url = EXCLUDED.source_url,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        visibility = EXCLUDED.visibility,
        content_hash = EXCLUDED.content_hash,
        indexed_at = now();
  END IF;

$projection$;
BEGIN
  IF to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy public.refresh_rag_index(text)';
  END IF;

  SELECT pg_get_functiondef('public.refresh_rag_index(text)'::regprocedure)
  INTO function_definition;

  IF position($needle$'property_types', pt.id, pt.slug$needle$ IN function_definition) > 0 THEN
    RAISE EXCEPTION 'Projection taxonomy đã tồn tại; dừng để tránh chèn trùng';
  END IF;

  IF position('  -- Never retain legacy admin document projections' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Wrapper RAG không khớp mẫu đã kiểm định; dừng để tránh thay thế mù';
  END IF;

  function_definition := replace(
    function_definition,
    '  -- Never retain legacy admin document projections',
    insertion || E'
  -- Never retain legacy admin document projections'
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Sau khi migration chạy, refresh riêng property_types, news_categories,
-- managed_pages trên Admin UI. Không full refresh.
