-- ============================================================================
-- Giai đoạn 2 (chịu tải): Materialized view cho trang chủ read-heavy
-- ----------------------------------------------------------------------------
-- Bối cảnh (đã kiểm chứng trong code):
--   • Trang chủ CMS-driven: getFeaturedSections() → lặp getPropertiesForSection()
--     cho từng section. Mỗi section auto-mode query bảng `properties` + JOIN
--     areas + property_types, có filter (area/listing_type/type/hot/featured),
--     sort, limit. => N+1 query mỗi lượt tải, lặp JOIN nhiều lần.
--   • Đây là trang traffic cao nhất, dữ liệu GIỐNG NHAU cho mọi khách vãng lai,
--     và CHỊU ĐƯỢC staleness vài phút → hợp với materialized view.
--
-- Thiết kế: MV `mv_active_properties` denormalize (pre-join) toàn bộ property
-- đang active kèm tên/slug khu vực + loại BĐS. Các section auto-query đọc từ MV
-- này thay vì join lại base table mỗi lần. Refresh CONCURRENTLY định kỳ (pg_cron)
-- để không khóa đọc.
--
-- An toàn: chỉ THÊM (MV + index + function + cron). Không sửa/xóa dữ liệu gốc.
--
-- ⚠️ BẢO MẬT: Materialized view KHÔNG áp RLS. MV này chỉ chứa property
--    is_active = true (vốn đã public qua RLS hiện tại) nên không lộ thêm dữ liệu.
--    KHÔNG đưa cột nhạy cảm/nội bộ vào MV.
--
-- ⚠️ DEPLOY ORDERING: App CHƯA được rewire đọc MV này (xem ghi chú cuối file).
--    Việc rewire phải deploy SAU khi MV tồn tại, tránh sập trang chủ.
-- ============================================================================

-- ─── Materialized view: active properties đã pre-join ───────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_active_properties;
CREATE MATERIALIZED VIEW mv_active_properties AS
SELECT
  p.id, p.title, p.slug, p.description,
  p.price, p.price_unit, p.price_label, p.price_per_month,
  p.listing_type, p.area_sqm, p.address, p.city, p.district,
  p.area_id, p.district_id, p.property_type_id,
  p.image_url, p.images, p.badge, p.badge_color, p.legal_status,
  p.is_featured, p.is_hot, p.views,
  p.bedrooms, p.bathrooms, p.direction,
  p.latitude, p.longitude,
  p.created_at, p.updated_at,
  a.name AS area_name, a.slug AS area_slug,
  t.name AS type_name, t.slug AS type_slug
FROM properties p
LEFT JOIN areas a          ON a.id = p.area_id
LEFT JOIN property_types t ON t.id = p.property_type_id
WHERE p.is_active = true;

-- UNIQUE index bắt buộc để REFRESH ... CONCURRENTLY hoạt động
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_active_properties_id
  ON mv_active_properties (id);

-- Index khớp filter/sort của getPropertiesForSection
CREATE INDEX IF NOT EXISTS idx_mv_active_listing_area_type
  ON mv_active_properties (listing_type, area_id, property_type_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_active_price
  ON mv_active_properties (price);
CREATE INDEX IF NOT EXISTS idx_mv_active_views
  ON mv_active_properties (views DESC);
CREATE INDEX IF NOT EXISTS idx_mv_active_featured
  ON mv_active_properties (created_at DESC) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_mv_active_hot
  ON mv_active_properties (created_at DESC) WHERE is_hot = true;

-- Cho phép client đọc MV (dữ liệu vốn public)
GRANT SELECT ON mv_active_properties TO anon, authenticated;

-- ─── Hàm refresh (CONCURRENTLY = không khóa đọc) ────────────────────────────
CREATE OR REPLACE FUNCTION refresh_mv_active_properties()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_active_properties;
END;
$$;

-- ─── Lịch refresh định kỳ qua pg_cron ───────────────────────────────────────
-- Supabase có sẵn extension pg_cron. Refresh mỗi 5 phút — cân bằng giữa độ tươi
-- và tải. Chỉnh chu kỳ tùy nhu cầu.
-- Nếu pg_cron chưa bật, bỏ qua block DO (MV vẫn dùng được, chỉ cần refresh thủ
-- công hoặc gọi refresh_mv_active_properties() từ trigger/Edge Function).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Gỡ job cũ nếu chạy lại migration
    PERFORM cron.unschedule('refresh_mv_active_properties')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_mv_active_properties');
    PERFORM cron.schedule(
      'refresh_mv_active_properties',
      '*/5 * * * *',
      $cron$ SELECT refresh_mv_active_properties(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron chưa bật — bật ở Dashboard > Database > Extensions, rồi chạy lại block cron này. MV vẫn dùng được, chỉ cần refresh thủ công.';
  END IF;
END;
$$;

-- ============================================================================
-- GHI CHÚ WIRING (CỐ Ý CHƯA LÀM — cần deploy đúng thứ tự)
-- ----------------------------------------------------------------------------
-- Sau khi migration này đã áp & xác nhận MV có dữ liệu, mới rewire app:
--
--   getPropertiesForSection() nhánh auto (src/lib/api/cms.ts):
--     • Đổi .from('properties').select('*, areas(...), property_types(...)')
--       → .from('mv_active_properties').select('*')
--     • MV trả cột PHẲNG (area_name/area_slug/type_name/type_slug) thay vì
--       nested areas{}/property_types{}. Cần map lại về shape Property, ví dụ:
--         areas: { name: row.area_name, slug: row.area_slug, ... }
--         property_types: { name: row.type_name, slug: row.type_slug, ... }
--       (hoặc chỉnh component đọc cột phẳng).
--     • Bỏ điều kiện .eq('is_active', true) vì MV đã lọc sẵn.
--
--   Vì CI auto-deploy frontend mỗi push, PHẢI áp migration TRƯỚC khi push code
--   đọc MV. Nếu không, trang chủ sẽ lỗi "relation mv_active_properties does not
--   exist". Đây là lý do bước wiring tách riêng, không gộp vào lần deploy này.
-- ============================================================================
