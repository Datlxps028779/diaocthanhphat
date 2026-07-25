-- =============================================================================
-- Dữ liệu giá (price_stats) — moat SEO/GEO/AIO: tổng hợp giá TỪ TIN ĐĂNG THẬT
-- =============================================================================
-- Không nhập tay, không bịa: RPC quét properties active rồi tính giá/m² theo
-- khu vực (area) / phường-xã (ward) / khu dân cư (neighborhood) × loại giao dịch.
-- Chỉ ghi nhóm có >= MIN_SAMPLES mẫu để KHÔNG sinh dữ liệu mỏng (mục 6 + 11 doc).
-- Luôn kèm sample_count + computed_at để trang hiển thị "số mẫu / ngày cập nhật".
--
-- Quy giá về triệu ngay trong SQL (khớp normalizeToTrieu ở src/lib/valuation.ts):
--   price_unit = 'tỷ' → price*1000, còn lại coi là triệu. Giá/m² = triệu / area_sqm.
-- Trung vị dùng percentile_cont(0.5) — bền với ngoại lai hơn trung bình.
--
-- Bảo mật: bảng chỉ cho anon SELECT; KHÔNG policy ghi → client thường không ghi
--   được. Chỉ RPC refresh_price_stats() (SECURITY DEFINER, guard is_admin()) ghi.
-- ⚠️ THỨ TỰ DEPLOY: áp migration này TRƯỚC, xác nhận chạy được, rồi push code gọi.

CREATE TABLE IF NOT EXISTS price_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,            -- 'area' | 'ward' | 'neighborhood'
  scope_key text NOT NULL,        -- slug của area/ward/neighborhood
  listing_type text NOT NULL,     -- 'mua_ban' | 'cho_thue'
  property_type_id uuid REFERENCES property_types(id) ON DELETE CASCADE,  -- NULL = mọi loại
  sample_count integer NOT NULL,
  avg_price_per_sqm numeric,      -- triệu/m²
  median_price_per_sqm numeric,   -- triệu/m²
  min_price_per_sqm numeric,
  max_price_per_sqm numeric,
  avg_area_sqm numeric,
  computed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_stats_lookup_idx ON price_stats(scope, scope_key, listing_type);

ALTER TABLE price_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_stats_select_public" ON price_stats;
CREATE POLICY "price_stats_select_public" ON price_stats FOR SELECT TO anon, authenticated USING (true);
-- Không có policy INSERT/UPDATE/DELETE: chỉ RPC SECURITY DEFINER dưới đây được ghi.

-- ----------------------------------------------------------------------------
-- RPC làm mới: xóa sạch rồi tính lại (bảng nhỏ → đơn giản, không lo stale).
-- Trả về số dòng đã ghi để admin biết có bao nhiêu nhóm đủ mẫu.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_price_stats()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được làm mới dữ liệu giá';
  END IF;

  DELETE FROM price_stats;

  WITH base AS (
    SELECT
      p.area_id,
      p.ward,
      p.neighborhood_slug,
      p.listing_type,
      p.area_sqm,
      (CASE WHEN p.price_unit = 'tỷ' THEN p.price * 1000 ELSE p.price END) / p.area_sqm AS pps
    FROM properties p
    WHERE p.is_active = true
      AND p.price > 0
      AND p.area_sqm > 0
  ),
  area_stats AS (
    SELECT 'area'::text AS scope, a.slug AS scope_key, b.listing_type, NULL::uuid AS property_type_id,
           count(*)::int AS sample_count,
           avg(b.pps) AS avg_pps,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY b.pps) AS median_pps,
           min(b.pps) AS min_pps, max(b.pps) AS max_pps, avg(b.area_sqm) AS avg_area
    FROM base b JOIN areas a ON a.id = b.area_id
    WHERE b.area_id IS NOT NULL
    GROUP BY a.slug, b.listing_type
  ),
  neighborhood_stats AS (
    SELECT 'neighborhood'::text, b.neighborhood_slug, b.listing_type, NULL::uuid,
           count(*)::int, avg(b.pps),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY b.pps),
           min(b.pps), max(b.pps), avg(b.area_sqm)
    FROM base b
    WHERE b.neighborhood_slug IS NOT NULL AND b.neighborhood_slug <> ''
    GROUP BY b.neighborhood_slug, b.listing_type
  ),
  ward_stats AS (
    SELECT 'ward'::text, w.slug, b.listing_type, NULL::uuid,
           count(*)::int, avg(b.pps),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY b.pps),
           min(b.pps), max(b.pps), avg(b.area_sqm)
    FROM base b JOIN wards w ON w.name = b.ward
    WHERE b.ward IS NOT NULL AND b.ward <> ''
    GROUP BY w.slug, b.listing_type
  ),
  merged AS (
    SELECT * FROM area_stats
    UNION ALL SELECT * FROM neighborhood_stats
    UNION ALL SELECT * FROM ward_stats
  )
  INSERT INTO price_stats (scope, scope_key, listing_type, property_type_id,
                           sample_count, avg_price_per_sqm, median_price_per_sqm,
                           min_price_per_sqm, max_price_per_sqm, avg_area_sqm, computed_at)
  SELECT scope, scope_key, listing_type, property_type_id,
         sample_count, avg_pps, median_pps, min_pps, max_pps, avg_area, now()
  FROM merged
  WHERE sample_count >= 3;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_price_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
