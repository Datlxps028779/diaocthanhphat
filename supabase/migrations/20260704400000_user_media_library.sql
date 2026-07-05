/*
# User Media Library — Thư viện ảnh riêng cho từng tài khoản

## Vấn đề
Hiện tại user upload ảnh qua `ImageUpload` component, ảnh được lưu vào Supabase Storage
(bucket `user-uploads`) nhưng không có bảng metadata nào để:
- Liệt kê tất cả ảnh user đã upload
- Xóa ảnh khỏi storage khi user muốn dọn dẹp
- Tái sử dụng ảnh đã upload cho nhiều tin đăng khác nhau
- Biết dung lượng đã dùng / còn lại

## Giải pháp
1. Bảng `user_media` lưu metadata từng file ảnh của user
2. RLS: user chỉ xem/xóa media của chính mình
3. Storage trigger tự động ghi metadata khi upload thành công
4. Frontend: tab "Thư viện ảnh" trong trang AccountPage
*/

-- ─── user_media ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  filename    text NOT NULL,
  folder      text NOT NULL DEFAULT 'properties',
  mime_type   text DEFAULT 'image/jpeg',
  size_bytes  bigint DEFAULT 0,
  width       int,
  height      int,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_media_user_id ON user_media(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_created_at ON user_media(created_at DESC);

ALTER TABLE user_media ENABLE ROW LEVEL SECURITY;

-- User chỉ xem được media của chính mình
DROP POLICY IF EXISTS "um_select_own" ON user_media;
CREATE POLICY "um_select_own" ON user_media FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- User chỉ insert được media của chính mình
DROP POLICY IF EXISTS "um_insert_own" ON user_media;
CREATE POLICY "um_insert_own" ON user_media FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- User chỉ xóa được media của chính mình
DROP POLICY IF EXISTS "um_delete_own" ON user_media;
CREATE POLICY "um_delete_own" ON user_media FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin xem/xóa được tất cả
DROP POLICY IF EXISTS "um_select_admin" ON user_media;
CREATE POLICY "um_select_admin" ON user_media FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "um_delete_admin" ON user_media;
CREATE POLICY "um_delete_admin" ON user_media FOR DELETE
  TO authenticated USING (is_admin());
