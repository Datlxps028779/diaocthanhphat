-- =============================================================================
-- Fix Storage Permissions: Admin thấy tất cả, User chỉ thấy ảnh của mình
-- Chạy file này trên Supabase SQL Editor
-- =============================================================================

-- Xóa policy SELECT cũ cho user-uploads
DROP POLICY IF EXISTS "user_uploads_select" ON storage.objects;

-- Policy mới: User chỉ xem được ảnh của chính mình, Admin xem được tất cả
CREATE POLICY "user_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- Cập nhật policy INSERT: user upload ảnh của mình
DROP POLICY IF EXISTS "user_uploads_insert" ON storage.objects;
CREATE POLICY "user_uploads_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND auth.uid() IS NOT NULL
  );

-- Cập nhật policy UPDATE: user chỉ sửa ảnh của mình, admin sửa tất cả
DROP POLICY IF EXISTS "user_uploads_update" ON storage.objects;
CREATE POLICY "user_uploads_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- Cập nhật policy DELETE: user chỉ xóa ảnh của mình, admin xóa tất cả
DROP POLICY IF EXISTS "user_uploads_delete" ON storage.objects;
CREATE POLICY "user_uploads_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- =============================================================================
-- Tóm tắt quyền sau khi chạy:
-- 
-- Bucket "admin-uploads" (chỉ admin):
--   - Admin: xem, upload, sửa, xóa tất cả ảnh
--   - User thường: không có quyền gì
--
-- Bucket "user-uploads" (user + admin):
--   - Admin: xem, upload, sửa, xóa TẤT CẢ ảnh
--   - User thường: xem, upload, sửa, xóa CHỈ ảnh của mình (owner = auth.uid())
--
-- Bảng user_media (metadata):
--   - Admin: xem tất cả metadata
--   - User: xem/xóa CHỈ metadata của mình
-- =============================================================================