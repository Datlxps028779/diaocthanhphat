-- =============================================================================
-- Storage Buckets Configuration & RLS Policies
-- Tách biệt hoàn toàn giữa admin-uploads và user-uploads
-- =============================================================================

-- ─── BƯỚC 1: Tạo Storage Buckets ────────────────────────────────────────────
-- Lưu ý: Các bucket này cần được tạo qua Supabase Dashboard hoặc CLI
-- Đây là SQL để thiết lập policies cho các bucket đã tạo

-- Tạo bucket bucket_admin_uploads (chỉ dành cho admin)
-- Tạo bucket bucket_user_uploads (cho người dùng thông thường)

-- ─── BƯỚC 2: RLS Policies cho storage.objects ────────────────────────────────
-- Xóa policies cũ nếu tồn tại
DROP POLICY IF EXISTS "admin_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_delete" ON storage.objects;

DROP POLICY IF EXISTS "user_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_delete" ON storage.objects;

-- Policy cho admin-uploads bucket
-- Chỉ admin mới có quyền truy cập đầy đủ
CREATE POLICY "admin_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy cho user-uploads bucket
-- Người dùng có thể upload, xem và xóa ảnh của chính họ
CREATE POLICY "user_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
  );

CREATE POLICY "user_uploads_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "user_uploads_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  );

CREATE POLICY "user_uploads_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  );

-- ─── BƯỚC 3: Thêm cấu hình bucket prefix ────────────────────────────────────
-- Thêm các cài đặt cho bucket prefix vào site_settings nếu chưa có
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('admin_bucket_prefix', 'admin-uploads', 'Bucket prefix cho admin', 'storage', 'text'),
  ('user_bucket_prefix', 'user-uploads', 'Bucket prefix cho người dùng', 'storage', 'text')
ON CONFLICT (key) DO NOTHING;