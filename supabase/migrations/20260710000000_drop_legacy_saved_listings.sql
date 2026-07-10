-- =============================================================================
-- Xoá bảng legacy saved_listings (attack surface, không còn dùng)
-- =============================================================================
-- saved_listings có RLS lỏng (SELECT/INSERT/DELETE đều USING(true) cho anon) →
-- anon đọc/xoá được toàn bảng. Nhưng bảng này KHÔNG được dùng ở đâu trong client:
-- tính năng yêu thích thật dùng property_favorites (đã scope theo user_id=auth.uid()).
-- Xoá hẳn để loại bỏ attack surface thay vì cố siết cơ chế session_id (text client
-- tự khai, không bảo mật được ở tầng RLS). Idempotent.
DROP TABLE IF EXISTS saved_listings CASCADE;
