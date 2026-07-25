-- =============================================================================
-- Fix: refresh_price_stats() bị lỗi "DELETE requires a WHERE clause"
-- =============================================================================
-- Supabase bật sql_safe_updates → DELETE không WHERE bị chặn. Thêm WHERE true
-- (xóa toàn bộ, có mệnh đề hợp lệ). Giữ nguyên toàn bộ logic tính lại bên dưới.
-- CREATE OR REPLACE — thay thế bản cũ, không đổi chữ ký/quyền.

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

  DELETE FROM price_stats WHERE true;

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
