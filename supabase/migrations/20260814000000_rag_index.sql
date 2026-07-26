-- =============================================================================
-- RAG nội bộ cho AI Chat (hybrid lexical) — kho chunk truy xuất được TỪ DỮ LIỆU THẬT
-- =============================================================================
-- Không dùng vector/embedding: tận dụng hạ tầng FTS sẵn có (f_unaccent +
-- to_tsvector('simple') + websearch_to_tsquery + pg_trgm) đã tạo ở
-- 20260707000000_search_and_performance_indexes.sql.
--
-- Bảng nguồn (properties/news/neighborhoods/areas/page_blocks/price_stats/
-- ai_chat_knowledge) GIỮ NGUYÊN là source-of-truth. Đây chỉ là 2 bảng DẪN XUẤT:
--   • rag_chunks     — kho chunk (nội dung sạch) + tsvector để retrieve.
--   • rag_index_runs — nhật ký reindex để Admin xem trạng thái.
--
-- Bảo mật: rag_chunks chỉ anon SELECT visibility='public'; ghi CHỈ qua RPC
--   refresh_rag_index() (SECURITY DEFINER, guard is_admin()). DELETE luôn có WHERE
--   (bài học sql_safe_updates). match_rag_chunks() chỉ trả public cho anon.
-- ⚠️ THỨ TỰ DEPLOY: áp migration này TRƯỚC, gọi refresh_rag_index() cho có chunk,
--   rồi mới push/deploy code gọi match_rag_chunks.

-- ─── Bảng chunk ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,          -- 'properties' | 'news' | 'neighborhoods' | 'areas' | 'price_stats' | 'ai_chat_knowledge'
  source_id uuid NOT NULL,             -- id dòng nguồn
  source_slug text,
  source_url text,                     -- đường dẫn công khai để trích dẫn/điều hướng
  title text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,               -- text đã làm sạch (không HTML)
  content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', f_unaccent(coalesce(title, '') || ' ' || coalesce(content, '')))
  ) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'public',   -- 'public' | 'internal'
  content_hash text NOT NULL,
  indexed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rag_chunks_source_uidx
  ON rag_chunks(source_table, source_id, chunk_index);
CREATE INDEX IF NOT EXISTS rag_chunks_tsv_idx ON rag_chunks USING gin (content_tsv);
CREATE INDEX IF NOT EXISTS rag_chunks_title_trgm_idx ON rag_chunks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS rag_chunks_metadata_idx ON rag_chunks USING gin (metadata);
CREATE INDEX IF NOT EXISTS rag_chunks_source_table_idx ON rag_chunks(source_table);
CREATE INDEX IF NOT EXISTS rag_chunks_visibility_idx ON rag_chunks(visibility);

ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rag_chunks_select_public" ON rag_chunks;
CREATE POLICY "rag_chunks_select_public" ON rag_chunks
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public' OR is_admin());
-- Không policy INSERT/UPDATE/DELETE: chỉ RPC SECURITY DEFINER dưới đây được ghi.

-- ─── Nhật ký reindex ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_index_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text,                   -- NULL = toàn bộ
  chunks_upserted integer DEFAULT 0,
  chunks_deleted integer DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',   -- 'ok' | 'error'
  error text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz DEFAULT now()
);

ALTER TABLE rag_index_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rag_index_runs_select_admin" ON rag_index_runs;
CREATE POLICY "rag_index_runs_select_admin" ON rag_index_runs
  FOR SELECT TO authenticated USING (is_admin());

-- ─── RPC retrieve: hybrid lexical rank (ts_rank + boost trigram tiêu đề) ──────
CREATE OR REPLACE FUNCTION match_rag_chunks(
  query text,
  match_count int DEFAULT 8,
  filter_source_types text[] DEFAULT NULL,
  filter_visibility text DEFAULT 'public'
)
RETURNS TABLE (
  chunk_id uuid,
  source_table text,
  source_id uuid,
  source_slug text,
  source_url text,
  title text,
  content text,
  metadata jsonb,
  score real
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT
      websearch_to_tsquery('simple', f_unaccent(coalesce(query, ''))) AS tsq,
      f_unaccent(coalesce(query, '')) AS uq
  )
  SELECT
    c.id, c.source_table, c.source_id, c.source_slug, c.source_url,
    c.title, c.content, c.metadata,
    (ts_rank(c.content_tsv, q.tsq) + 0.5 * similarity(f_unaccent(c.title), q.uq))::real AS score
  FROM rag_chunks c, q
  WHERE
    -- anon chỉ thấy public; admin (JWT) có thể truyền 'internal'
    (c.visibility = coalesce(filter_visibility, 'public') OR (is_admin() AND filter_visibility IS NULL))
    AND (filter_source_types IS NULL OR c.source_table = ANY(filter_source_types))
    AND (
      c.content_tsv @@ q.tsq
      OR similarity(f_unaccent(c.title), q.uq) > 0.2
    )
  ORDER BY score DESC
  LIMIT greatest(1, least(coalesce(match_count, 8), 30));
$$;

GRANT EXECUTE ON FUNCTION match_rag_chunks(text, int, text[], text) TO anon, authenticated;

-- ─── RPC reindex: admin-only, xây lại chunk TỪ BẢNG NGUỒN (thuần SQL, không LLM) ─
-- target = NULL → toàn bộ; hoặc 1 trong các source_table để reindex riêng.
-- DELETE luôn có WHERE (sql_safe_updates). Ghi 1 dòng rag_index_runs.
CREATE OR REPLACE FUNCTION refresh_rag_index(target text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_deleted integer := 0;
  n_upserted integer := 0;
  do_all boolean := target IS NULL;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được đồng bộ dữ liệu AI';
  END IF;

  -- Xóa chunk của (các) nguồn sắp dựng lại — có WHERE hợp lệ.
  DELETE FROM rag_chunks WHERE do_all OR source_table = target;
  GET DIAGNOSTICS n_deleted = ROW_COUNT;

  -- (1) PROPERTIES — 1 chunk/tin đang hiển thị.
  IF do_all OR target = 'properties' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'properties', p.id, p.slug, '/bat-dong-san/' || coalesce(p.slug, p.id::text), p.title, 0,
      concat_ws(E'\n',
        p.title,
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
        'area_sqm', p.area_sqm, 'legal_status', p.legal_status, 'slug', p.slug
      )),
      'public',
      md5(coalesce(p.title,'') || coalesce(p.description,'') || coalesce(p.price_label,'') || p.price::text || coalesce(p.updated_at::text,''))
    FROM properties p
    WHERE p.is_active = true;
  END IF;

  -- (2) NEWS — 1 chunk/bài đã đăng.
  IF do_all OR target = 'news' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'news', n.id, n.slug, '/tin-tuc/' || n.slug, n.title, 0,
      concat_ws(E'\n',
        n.title,
        nullif(n.excerpt,''),
        left(regexp_replace(coalesce(n.content,''), '<[^>]+>', ' ', 'g'), 3000)
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'category', n.category, 'geo_area', n.geo_area, 'geo_entity', n.geo_entity
      )),
      'public',
      md5(coalesce(n.title,'') || coalesce(n.content,'') || coalesce(n.updated_at::text,''))
    FROM news n
    WHERE n.is_published = true;
  END IF;

  -- (3) NEIGHBORHOODS — chunk "pillar": tên + mô tả + nội dung page_blocks (namespace khu-dan-cu:<slug>) + FAQ.
  IF do_all OR target = 'neighborhoods' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'neighborhoods', nh.id, nh.slug, '/khu-dan-cu/' || nh.slug, nh.name, 0,
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
      md5(coalesce(nh.name,'') || coalesce(nh.description,'') || coalesce(nh.updated_at::text, nh.created_at::text,''))
    FROM neighborhoods nh;
  END IF;

  -- (4) AREAS — chunk tổng quan khu vực (tên + mô tả + meta).
  IF do_all OR target = 'areas' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'areas', a.id, a.slug, '/khu-vuc/' || a.slug, a.name, 0,
      concat_ws(E'\n',
        'Khu vực ' || a.name,
        nullif(a.description,''),
        nullif(a.meta_description,'')
      ),
      jsonb_strip_nulls(jsonb_build_object('area_slug', a.slug)),
      'public',
      md5(coalesce(a.name,'') || coalesce(a.description,'') || coalesce(a.meta_description,''))
    FROM areas a;
  END IF;

  -- (5) PRICE_STATS — chunk giá có cấu trúc (grounding). Chỉ dòng tổng (property_type_id IS NULL).
  IF do_all OR target = 'price_stats' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'price_stats', ps.id, ps.scope_key,
      CASE ps.scope
        WHEN 'area' THEN '/khu-vuc/' || ps.scope_key
        WHEN 'neighborhood' THEN '/khu-dan-cu/' || ps.scope_key
        ELSE '/du-lieu-gia' END,
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
    WHERE ps.property_type_id IS NULL AND ps.sample_count >= 3;
  END IF;

  -- (6) AI_CHAT_KNOWLEDGE — chỉ priority_qa/background active (KHÔNG rule/test_case).
  IF do_all OR target = 'ai_chat_knowledge' THEN
    INSERT INTO rag_chunks (source_table, source_id, source_slug, source_url, title, chunk_index, content, metadata, visibility, content_hash)
    SELECT 'ai_chat_knowledge', k.id, NULL, NULL, k.topic, 0,
      concat_ws(E'\n', k.topic, k.answer),
      jsonb_strip_nulls(jsonb_build_object('knowledge_type', k.knowledge_type)),
      'public',
      md5(coalesce(k.topic,'') || coalesce(k.answer,'') || coalesce(k.updated_at::text,''))
    FROM ai_chat_knowledge k
    WHERE k.is_active = true AND k.knowledge_type IN ('priority_qa', 'background');
  END IF;

  SELECT count(*)::int INTO n_upserted FROM rag_chunks WHERE do_all OR source_table = target;

  INSERT INTO rag_index_runs (source_table, chunks_upserted, chunks_deleted, status, finished_at)
  VALUES (target, n_upserted, n_deleted, 'ok', now());

  RETURN n_upserted;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_rag_index(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
