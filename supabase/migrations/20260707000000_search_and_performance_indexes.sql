-- ============================================================================
-- Giai đoạn 1: Full-text search + composite index cho quy mô ×5
-- ----------------------------------------------------------------------------
-- Mục tiêu:
--   1. Trigram GIN trên CỘT THÔ → câu `ilike '%kw%'` hiện tại tự dùng index
--      (KHÔNG cần đổi code). Đây là thắng lợi rủi ro thấp nhất.
--   2. tsvector + unaccent → nền cho tìm kiếm tiếng Việt KHÔNG DẤU, có xếp hạng
--      (dùng khi nâng cấp getAllProperties ở bước sau).
--   3. Composite/partial index khớp đúng bộ filter + sort trong getAllProperties.
--
-- An toàn: toàn bộ là thao tác THÊM (additive) — không sửa/xóa dữ liệu.
-- Idempotent: IF NOT EXISTS ở mọi nơi.
--
-- ⚠️ LƯU Ý VẬN HÀNH (đọc trước khi áp lên production):
--   • ADD COLUMN ... GENERATED STORED sẽ REWRITE toàn bảng properties một lần
--     (khóa ghi trong lúc chạy). Với vài nghìn dòng là nhanh; nếu bảng đã lớn,
--     chạy vào giờ thấp điểm.
--   • CREATE INDEX (không CONCURRENTLY) khóa GHI khi build. Migration của Supabase
--     chạy trong transaction nên KHÔNG dùng được CONCURRENTLY. Nếu bảng lớn và cần
--     zero-downtime, chạy các lệnh CREATE INDEX CONCURRENTLY thủ công NGOÀI file này.
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram: tăng tốc ilike '%...%'
CREATE EXTENSION IF NOT EXISTS unaccent;  -- bỏ dấu tiếng Việt cho tìm kiếm

-- ─── (1) Trigram GIN trên CỘT THÔ — phục vụ `ilike` HIỆN TẠI, không đổi code ──
-- App query: title/address/city/district ILIKE '%kw%' (trên cột thô).
-- Index phải đúng trên cột thô thì planner mới dùng được.
CREATE INDEX IF NOT EXISTS idx_properties_title_trgm
  ON properties USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm
  ON properties USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_city_trgm
  ON properties USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_district_trgm
  ON properties USING gin (district gin_trgm_ops);

-- ─── (2) Nền tìm kiếm KHÔNG DẤU, có xếp hạng ────────────────────────────────
-- Wrapper unaccent IMMUTABLE (unaccent gốc là STABLE, không dùng được trong
-- generated column / index). Pattern chuẩn của cộng đồng Postgres.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- Cột tsvector generated — tự cập nhật khi các trường nguồn đổi.
-- Config 'simple' (không stemming) + unaccent → hợp tiếng Việt.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      f_unaccent(coalesce(title, '')) || ' ' ||
      f_unaccent(coalesce(address, '')) || ' ' ||
      f_unaccent(coalesce(city, '')) || ' ' ||
      f_unaccent(coalesce(district, '')) || ' ' ||
      f_unaccent(coalesce(description, ''))
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_properties_search_vector
  ON properties USING gin (search_vector);

-- ─── (3) Composite / partial index khớp filter phổ biến ─────────────────────
-- Gần như mọi query công khai đều có `is_active = true` → partial index nhỏ & nhanh.
CREATE INDEX IF NOT EXISTS idx_properties_active_listing_area
  ON properties (listing_type, area_id, property_type_id, created_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_properties_active_price
  ON properties (price)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_properties_active_created
  ON properties (created_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_properties_active_featured
  ON properties (created_at DESC)
  WHERE is_active = true AND is_featured = true;

CREATE INDEX IF NOT EXISTS idx_properties_active_hot
  ON properties (views DESC)
  WHERE is_active = true AND is_hot = true;

CREATE INDEX IF NOT EXISTS idx_properties_active_geo
  ON properties (area_id, property_type_id)
  WHERE is_active = true AND latitude IS NOT NULL;

-- ─── (4) RPC tìm kiếm KHÔNG DẤU, xếp hạng theo độ liên quan ──────────────────
-- Dùng search_vector (accent-insensitive vì cả vector lẫn query đều đã unaccent).
-- Trả id + rank để tầng ứng dụng nâng cấp dần, thay cho ilike khi cần bỏ dấu.
CREATE OR REPLACE FUNCTION search_property_ids(kw text)
RETURNS TABLE (id uuid, rank real)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id,
         ts_rank(p.search_vector, websearch_to_tsquery('simple', f_unaccent(kw))) AS rank
  FROM properties p
  WHERE p.is_active = true
    AND p.search_vector @@ websearch_to_tsquery('simple', f_unaccent(kw))
  ORDER BY rank DESC;
$$;

GRANT EXECUTE ON FUNCTION search_property_ids(text) TO anon, authenticated;
