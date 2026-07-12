-- =============================================================================
-- Fix: thêm cột images cho user_listings (gallery nhiều ảnh)
-- =============================================================================
-- Bảng user_listings chỉ có image_url (1 ảnh đại diện), THIẾU cột images (mảng).
-- Nhưng luồng đăng tin luôn gửi kèm key `images` → PostgREST trả 42703
-- "column user_listings.images does not exist" → mọi lần "Gửi duyệt tin" thất bại.
-- properties đã có cột images (text[]) từ 20260703011827; căn theo cho khớp.
-- Idempotent: IF NOT EXISTS. Reload PostgREST schema cache để hết PGRST204.

ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS images text[];

NOTIFY pgrst, 'reload schema';
