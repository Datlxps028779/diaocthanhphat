-- ============================================================================
-- Giai đoạn 2: Đếm atomic (views / impressions / clicks) — hết race condition
-- ----------------------------------------------------------------------------
-- Vấn đề hiện tại:
--   • App gọi RPC `increment_counter` (banner) NHƯNG hàm này chưa tồn tại trong
--     DB → luôn rơi vào fallback read-modify-write (SELECT rồi UPDATE +1).
--   • properties/news tăng `views` cũng bằng read-modify-write inline.
--   Read-modify-write bị RACE: 2 request đồng thời cùng đọc N rồi cùng ghi N+1
--   → mất lượt đếm. Ở quy mô ×5, sai số càng lớn + khóa hàng nóng.
--
-- Giải pháp: UPDATE ... SET col = col + 1 trong 1 câu (atomic ở tầng DB).
--
-- An toàn: chỉ THÊM function, không sửa/xóa dữ liệu. Idempotent (OR REPLACE).
-- ============================================================================

-- ─── increment_counter: khớp signature app đang gọi (banners) ───────────────
-- App gọi: rpc('increment_counter', { table_name, row_id, column_name }).
-- Dynamic SQL nên PHẢI chống injection: chỉ cho phép cặp (bảng, cột) trong
-- whitelist, và quote identifier bằng %I. Ngoài whitelist → báo lỗi.
CREATE OR REPLACE FUNCTION increment_counter(
  table_name text,
  row_id uuid,
  column_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  -- Whitelist cứng các cặp (bảng, cột) được phép tăng
  allowed := (table_name, column_name) IN (
    ('banners', 'impressions'),
    ('banners', 'clicks'),
    ('properties', 'views'),
    ('news', 'views')
  );

  IF NOT allowed THEN
    RAISE EXCEPTION 'increment_counter: cặp (%, %) không được phép', table_name, column_name;
  END IF;

  EXECUTE format(
    'UPDATE %I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    table_name, column_name, column_name
  ) USING row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_counter(text, uuid, text) TO anon, authenticated;

-- ─── Hàm chuyên biệt cho views (rõ ràng, ưu tiên dùng) ──────────────────────
-- App có thể gọi trực tiếp thay cho read-modify-write inline. Fallback vẫn giữ
-- ở tầng app phòng khi migration chưa áp (xem properties.ts / news.ts).
CREATE OR REPLACE FUNCTION increment_property_views(row_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE properties SET views = COALESCE(views, 0) + 1 WHERE id = row_id;
$$;

CREATE OR REPLACE FUNCTION increment_news_views(row_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE news SET views = COALESCE(views, 0) + 1 WHERE id = row_id;
$$;

GRANT EXECUTE ON FUNCTION increment_property_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_news_views(uuid) TO anon, authenticated;
