-- =============================================================================
-- Unified public-to-AIO RAG boundary.
--
-- This replaces refresh_rag_index with a server-callable variant while keeping
-- owner-MFA admin access. The application server uses service_role after the
-- public cache and Search Visibility propagation have completed. RAG citations
-- prefer the canonical path stored by Search Visibility.
-- Production SQL is run by the user after review.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION refresh_rag_index(target text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n_deleted integer := 0;
  n_upserted integer := 0;
  do_all boolean := target IS NULL;
BEGIN
  -- Serialize full and per-source rebuilds so a concurrent admin/manual refresh
  -- cannot delete a freshly rebuilt projection or report a mixed run.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.refresh_rag_index', 0));

  IF target IS NOT NULL AND target NOT IN (
    'properties', 'news', 'property_types', 'news_categories', 'neighborhoods',
    'areas', 'price_stats', 'managed_pages', 'ai_chat_knowledge', 'admin_docs'
  ) THEN
    RAISE EXCEPTION 'Nguồn RAG không được hỗ trợ: %', target USING ERRCODE = '22023';
  END IF;

  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.is_owner_mfa()) THEN
    RAISE EXCEPTION 'Chỉ server hoặc chủ hệ thống đã xác thực đa yếu tố được đồng bộ dữ liệu AI';
  END IF;

  -- Xóa chunk của (các) nguồn sắp dựng lại — có WHERE hợp lệ.
  DELETE FROM rag_chunks WHERE do_all OR source_table = target;
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  -- (1) PROPERTIES — 1 chunk/tin đang hiển thị.
  IF do_all OR target = 'properties' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'properties', p.id, btrim(p.slug), sv.canonical_path,
      p.title, 0,
      concat_ws(E'\n',
        p.title,
        CASE WHEN pt.name IS NOT NULL THEN 'Loại bất động sản: ' || pt.name END,
        CASE WHEN p.listing_type = 'cho_thue' THEN 'Nhu cầu: cho thuê' ELSE 'Nhu cầu: mua bán' END,
        'Vị trí: ' || concat_ws(', ', nullif(p.address,''), nullif(p.ward,''), nullif(p.district,''), nullif(p.city,'')),
        'Giá: ' || coalesce(p.price_label, (p.price::text || ' ' || p.price_unit)),
        CASE WHEN p.area_sqm IS NOT NULL THEN 'Diện tích: ' || p.area_sqm || ' m²' END,
        CASE WHEN p.legal_status IS NOT NULL THEN 'Pháp lý: ' || p.legal_status END,
        CASE WHEN p.bedrooms IS NOT NULL THEN 'Phòng ngủ: ' || p.bedrooms END,
        left(regexp_replace(coalesce(p.description,''), '<[^>]+>', ' ', 'g'), 1500),
        CASE WHEN p.amenities IS NOT NULL THEN 'Tiện ích: ' || array_to_string(p.amenities, ', ') END
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'area_id', p.area_id, 'district', p.district, 'ward', p.ward,
        'neighborhood_slug', p.neighborhood_slug, 'listing_type', p.listing_type,
        'price', p.price, 'price_unit', p.price_unit, 'property_type_id', p.property_type_id,
        'area_sqm', p.area_sqm, 'legal_status', p.legal_status, 'slug', p.slug,
        'property_type_name', pt.name, 'property_type_slug', pt.slug
      )),
      'public',
      md5(coalesce(p.title,'') || coalesce(p.description,'') || coalesce(p.price_label,'') || p.price::text
        || coalesce(pt.name,'') || coalesce(pt.slug,'') || coalesce(p.updated_at::text,''))
    FROM properties p
    JOIN search_visibility_urls sv
      ON sv.source_key = 'property:' || p.id::text
     AND sv.entity_type = 'property'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    LEFT JOIN property_types pt ON pt.id = p.property_type_id
    WHERE p.is_active = true
      AND p.public_code IS NOT NULL AND p.public_code > 0
      AND btrim(coalesce(p.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      AND p.listing_type::text IN ('mua_ban', 'cho_thue')
      AND EXISTS (
        SELECT 1 FROM areas a
        WHERE a.id = p.area_id
          AND btrim(coalesce(a.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      );
  END IF;

  -- (2) NEWS — 1 chunk/bài đã đăng.
  IF do_all OR target = 'news' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'news', n.id, btrim(n.slug), sv.canonical_path,
      n.title, 0,
      concat_ws(E'\n',
        n.title,
        nullif(n.excerpt,''),
        left(regexp_replace(coalesce(n.content,''), '<[^>]+>', ' ', 'g'), 3000)
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'category', n.category, 'geo_area', n.geo_area, 'geo_entity', n.geo_entity
      )),
      'public',
      md5(coalesce(n.title,'') || coalesce(n.excerpt,'') || coalesce(n.content,'')
        || coalesce(n.category,'') || coalesce(n.geo_area,'') || coalesce(n.geo_entity,'')
        || coalesce(n.updated_at::text,''))
    FROM news n
    JOIN search_visibility_urls sv
      ON sv.source_key = 'news:' || n.id::text
     AND sv.entity_type = 'news'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    WHERE n.is_published = true
      AND btrim(coalesce(n.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (3) PROPERTY_TYPES — grounding taxonomy cho AIO. Không tạo URL public riêng
  -- vì hệ thống hiện không có route canonical cho từng loại BĐS.
  IF do_all OR target = 'property_types' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'property_types', pt.id, btrim(pt.slug), NULL, pt.name, 0,
      concat_ws(E'\n', 'Loại bất động sản: ' || pt.name, 'Slug phân loại: ' || pt.slug),
      jsonb_strip_nulls(jsonb_build_object('property_type_slug', pt.slug, 'icon', pt.icon)),
      'public', md5(coalesce(pt.name,'') || coalesce(pt.slug,'') || coalesce(pt.icon,''))
    FROM property_types pt
    WHERE btrim(coalesce(pt.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (4) NEWS_CATEGORIES — taxonomy có route canonical và mô tả SEO.
  IF do_all OR target = 'news_categories' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'news_categories', nc.id, btrim(nc.slug), sv.canonical_path, nc.label, 0,
      concat_ws(E'\n', 'Danh mục tin tức: ' || nc.label, nullif(nc.seo_description, '')),
      jsonb_strip_nulls(jsonb_build_object('category_label', nc.label, 'category_slug', nc.slug)),
      'public', md5(coalesce(nc.label,'') || coalesce(nc.slug,'') || coalesce(nc.seo_description,'') || coalesce(nc.updated_at::text,''))
    FROM news_categories nc
    JOIN search_visibility_urls sv
      ON (sv.source_key = 'news_category:' || nc.id::text
          OR sv.source_key = 'news_category:static:' || btrim(nc.slug))
     AND sv.entity_type = 'news_category'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    WHERE btrim(coalesce(nc.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (3) NEIGHBORHOODS — chunk "pillar": tên + mô tả + nội dung page_blocks (namespace khu-dan-cu:<slug>) + FAQ.
  IF do_all OR target = 'neighborhoods' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'neighborhoods', nh.id, btrim(nh.slug), sv.canonical_path, nh.name, 0,
      concat_ws(E'\n',
        'Khu dân cư ' || nh.name,
        nullif(nh.description,''),
        (SELECT string_agg(
                  concat_ws(': ', nullif(pb.label,''), left(regexp_replace(coalesce(pb.value,''), '<[^>]+>', ' ', 'g'), 2000)),
                  E'\n' ORDER BY pb.order_index)
         FROM page_blocks pb WHERE pb.page_slug = 'khu-dan-cu:' || nh.slug)
      ),
      jsonb_strip_nulls(jsonb_build_object('neighborhood_slug', nh.slug, 'ward_id', nh.ward_id)),
      'public',
      md5(coalesce(nh.name,'') || coalesce(nh.description,'') || coalesce(nh.created_at::text,'')
        || coalesce((SELECT string_agg(coalesce(pb.label,'') || ':' || coalesce(pb.value,''), E'\n' ORDER BY pb.order_index)
          FROM page_blocks pb WHERE pb.page_slug = 'khu-dan-cu:' || nh.slug), ''))
    FROM neighborhoods nh
    JOIN search_visibility_urls sv
      ON sv.source_key = 'neighborhood:' || nh.id::text
     AND sv.entity_type = 'neighborhood'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    WHERE btrim(coalesce(nh.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (5) AREAS — chunk tổng quan khu vực (tên + mô tả + meta).
  IF do_all OR target = 'areas' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'areas', a.id, btrim(a.slug), sv.canonical_path, a.name, 0,
      concat_ws(E'\n',
        'Khu vực ' || a.name,
        nullif(a.description,''),
        nullif(a.meta_description,'')
      ),
      jsonb_strip_nulls(jsonb_build_object('area_slug', a.slug)),
      'public',
      md5(coalesce(a.name,'') || coalesce(a.description,'') || coalesce(a.meta_description,''))
    FROM areas a
    JOIN search_visibility_urls sv
      ON sv.source_key = 'area:' || a.id::text
     AND sv.entity_type = 'area'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    WHERE btrim(coalesce(a.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (7) MANAGED_PAGES — nội dung CMS public. Các namespace nội bộ như
  -- khu-dan-cu:<slug> được đưa vào chunk neighborhoods ở trên, không nhân đôi.
  IF do_all OR target = 'managed_pages' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'managed_pages', mp.id, btrim(mp.slug), sv.canonical_path, mp.title, 0,
      concat_ws(E'\n', mp.title, nullif(mp.description, ''), (
        SELECT string_agg(
          concat_ws(': ', nullif(pb.label, ''), nullif(pb.value, '')),
          E'\n' ORDER BY pb.section, pb.order_index, pb.key
        )
        FROM page_blocks pb
        WHERE pb.page_slug = mp.slug
      )),
      jsonb_strip_nulls(jsonb_build_object('page_slug', mp.slug, 'is_system', mp.is_system)),
      'public', md5(coalesce(mp.title,'') || coalesce(mp.description,'') || coalesce(mp.slug,'')
        || coalesce(mp.updated_at::text,'')
        || coalesce((SELECT string_agg(coalesce(pb.label,'') || ':' || coalesce(pb.value,''), E'\n' ORDER BY pb.section, pb.order_index, pb.key)
          FROM page_blocks pb WHERE pb.page_slug = mp.slug), ''))
    FROM managed_pages mp
    JOIN search_visibility_urls sv
      ON sv.source_key = 'managed_page:' || mp.id::text
     AND sv.entity_type = 'managed_page'
     AND sv.eligible = true
     AND sv.canonical_path IS NOT NULL
    WHERE mp.is_active = true
      AND mp.is_system = false
      AND btrim(coalesce(mp.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (6) PRICE_STATS — chunk giá có cấu trúc (grounding). Chỉ dòng tổng (property_type_id IS NULL).
  IF do_all OR target = 'price_stats' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'price_stats', ps.id, ps.scope_key,
      '/du-lieu-gia',
      'Giá ' ||
        CASE ps.scope WHEN 'area' THEN 'khu vực' WHEN 'ward' THEN 'phường/xã' ELSE 'khu dân cư' END ||
        ' ' || coalesce(nm.name, ps.scope_key),
      0,
      concat_ws(' ',
        'Giá',
        CASE WHEN ps.listing_type = 'cho_thue' THEN 'cho thuê' ELSE 'mua bán' END,
        CASE ps.scope WHEN 'area' THEN 'khu vực' WHEN 'ward' THEN 'phường/xã' ELSE 'khu dân cư' END,
        coalesce(nm.name, ps.scope_key) || ':',
        'trung vị', round(ps.median_price_per_sqm)::text, 'triệu/m²,',
        ps.sample_count::text, 'mẫu, cập nhật', to_char(ps.computed_at, 'DD/MM/YYYY') || '.'
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'scope', ps.scope, 'scope_key', ps.scope_key, 'listing_type', ps.listing_type,
        'sample_count', ps.sample_count, 'median_price_per_sqm', ps.median_price_per_sqm
      )),
      'public',
      md5(ps.scope || ps.scope_key || ps.listing_type || coalesce(ps.median_price_per_sqm::text,'') || coalesce(ps.computed_at::text,''))
    FROM price_stats ps
    LEFT JOIN LATERAL (
      SELECT CASE ps.scope
        WHEN 'area' THEN (SELECT a.name FROM areas a WHERE a.slug = ps.scope_key)
        WHEN 'ward' THEN (SELECT w.name FROM wards w WHERE w.slug = ps.scope_key)
        WHEN 'neighborhood' THEN (SELECT nh.name FROM neighborhoods nh WHERE nh.slug = ps.scope_key)
      END AS name
    ) nm ON true
    WHERE ps.property_type_id IS NULL
      AND ps.sample_count >= 3
      AND btrim(coalesce(ps.scope_key, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';
  END IF;

  -- (8) AI_CHAT_KNOWLEDGE — chỉ priority_qa/background active (KHÔNG rule/test_case).
  -- Tự thích ứng: bảng gốc chưa có cột knowledge_type (migration hierarchy chưa chạy)
  -- thì lấy toàn bộ câu đang bật; có cột thì lọc priority_qa/background.
  IF do_all OR target = 'ai_chat_knowledge' THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ai_chat_knowledge' AND column_name = 'knowledge_type'
    ) THEN
      EXECUTE $q$
        INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
        SELECT 'ai_chat_knowledge', k.id, NULL, NULL, k.topic, 0,
          concat_ws(E'\n', k.topic, k.answer),
          jsonb_strip_nulls(jsonb_build_object('knowledge_type', k.knowledge_type)),
          'public',
          md5(coalesce(k.topic,'') || coalesce(k.answer,'') || coalesce(k.updated_at::text,''))
        FROM ai_chat_knowledge k
        WHERE k.is_active = true AND k.knowledge_type IN ('priority_qa', 'background')
      $q$;
    ELSE
      INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
      SELECT 'ai_chat_knowledge', k.id, NULL, NULL, k.topic, 0,
        concat_ws(E'\n', k.topic, k.answer),
        '{}'::jsonb,
        'public',
        md5(coalesce(k.topic,'') || coalesce(k.answer,'') || coalesce(k.updated_at::text,''))
      FROM ai_chat_knowledge k
      WHERE k.is_active = true;
    END IF;
  END IF;

  -- (9) ADMIN_DOCS — giữ nguyên private boundary đã áp ở migration owner access.
  -- Tài liệu nội bộ không được đưa vào public AIO/RAG; nhánh này chỉ dọn legacy chunk.
  IF do_all OR target = 'admin_docs' THEN
    -- DELETE đầu hàm đã xóa source này; không insert lại nội dung private.
    NULL;
  END IF;

  SELECT count(*)::int INTO n_upserted FROM rag_chunks WHERE do_all OR source_table = target;

  INSERT INTO rag_index_runs (source_table, chunks_upserted, chunks_deleted, status, finished_at)
  VALUES (target, n_upserted, n_deleted, 'ok', now());

  RETURN n_upserted;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_rag_index(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
