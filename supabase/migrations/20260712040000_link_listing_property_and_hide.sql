-- =============================================================================
-- Liên kết user_listings ↔ properties + tự ẩn tin công khai khi từ chối/xóa/sửa
-- =============================================================================
-- Vấn đề: duyệt tin tạo 1 dòng MỚI trong properties (is_active=true), nhưng
-- user_listings KHÔNG có cột nối tới dòng đó. Nên khi admin TỪ CHỐI, user XÓA,
-- hay user SỬA (về pending) một tin đã duyệt, dòng properties công khai vẫn còn
-- is_active=true → tin vẫn hiện trang chủ/danh sách/chi tiết.
--
-- Cách xử lý:
--  1. Thêm cột property_id trên user_listings (nối tới dòng properties lúc duyệt).
--  2. Trigger (SECURITY DEFINER — vượt RLS để user xóa cũng ẩn được properties):
--     - AFTER UPDATE: nếu status rời khỏi 'approved' và có property_id → ẩn property.
--     - AFTER DELETE: nếu có property_id → ẩn property.
--  Query công khai đã lọc is_active=true khắp nơi nên chỉ cần đặt cờ này.
-- Idempotent: IF NOT EXISTS + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION hide_property_when_listing_unpublished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.property_id IS NOT NULL THEN
      UPDATE properties SET is_active = false WHERE id = OLD.property_id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: chỉ ẩn khi tin RỜI khỏi trạng thái approved (từ chối / sửa về pending).
  IF OLD.property_id IS NOT NULL
     AND OLD.status = 'approved'
     AND NEW.status <> 'approved' THEN
    UPDATE properties SET is_active = false WHERE id = OLD.property_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hide_property_on_unpublish ON user_listings;
CREATE TRIGGER trg_hide_property_on_unpublish
  AFTER UPDATE OR DELETE ON user_listings
  FOR EACH ROW
  EXECUTE FUNCTION hide_property_when_listing_unpublished();

NOTIFY pgrst, 'reload schema';
