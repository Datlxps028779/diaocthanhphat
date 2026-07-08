-- ============================================================================
-- Fix MV cho trang chủ: bọc mv_active_properties qua RPC function
-- ----------------------------------------------------------------------------
-- Bối cảnh: mv_active_properties tồn tại + đủ data (8 dòng) + quyền anon=SELECT,
-- NHƯNG PostgREST trả 404 PGRST205 khi đọc VIEW trực tiếp qua REST (schema cache
-- không nạp lại matview mới — NOTIFY / restart / COMMENT đều không ăn).
--
-- Giải pháp bền: KHÔNG expose matview trực tiếp. Bọc SELECT trong 1 RPC function.
-- PostgREST expose function ổn định qua rpc('get_section_properties', {...}),
-- miễn nhiễm lỗi cache view. MV vẫn chạy tốt khi query TỪ BÊN TRONG DB.
--
-- Thay thế logic filter/sort của getPropertiesForSection (nhánh auto-mode):
--   filter_area_id, filter_listing_type, filter_property_type_id,
--   filter_is_hot, filter_is_featured, auto_sort, display_count.
--
-- An toàn: chỉ THÊM function. Idempotent (OR REPLACE). Không sửa/xóa dữ liệu.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_section_properties(
  p_area_id          uuid    DEFAULT NULL,
  p_listing_type     text    DEFAULT NULL,
  p_property_type_id uuid    DEFAULT NULL,
  p_is_hot           boolean DEFAULT NULL,
  p_is_featured      boolean DEFAULT NULL,
  p_sort             text    DEFAULT 'created_at',
  p_limit            int     DEFAULT 8
)
RETURNS SETOF mv_active_properties
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM mv_active_properties m
  WHERE (p_area_id          IS NULL OR m.area_id = p_area_id)
    AND (p_listing_type     IS NULL OR p_listing_type = '' OR m.listing_type = p_listing_type)
    AND (p_property_type_id IS NULL OR m.property_type_id = p_property_type_id)
    AND (p_is_hot           IS NULL OR p_is_hot = false OR m.is_hot = true)
    AND (p_is_featured      IS NULL OR p_is_featured = false OR m.is_featured = true)
  ORDER BY
    CASE WHEN p_sort = 'price_asc'  THEN m.price END ASC  NULLS LAST,
    CASE WHEN p_sort = 'price_desc' THEN m.price END DESC NULLS LAST,
    CASE WHEN p_sort = 'views'      THEN m.views END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('price_asc','price_desc','views')
         THEN m.created_at END DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_section_properties(uuid, text, uuid, boolean, boolean, text, int)
  TO anon, authenticated;

-- ─── Test nhanh sau khi áp (chạy riêng trong SQL Editor) ────────────────────
-- select * from get_section_properties(p_listing_type := 'mua_ban', p_limit := 8);
-- Kỳ vọng: trả tối đa 8 dòng property is_active, cột phẳng area_name/type_name.
