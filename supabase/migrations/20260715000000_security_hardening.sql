-- =============================================================================
-- Vá lỗ hổng bảo mật: siết anon INSERT leads + storage user-uploads theo owner
-- =============================================================================
-- Đợt 4.2 (audit): (M1) anon insert leads đang WITH CHECK(true) → ai có anon key
-- cũng script nhồi lead + bịa status='won'/gán NV/ghi note. Siết anon chỉ tạo được
-- lead "mới, chưa gán". (L1) user-uploads SELECT mở toàn bucket → user đọc file
-- của nhau; siết theo owner. Idempotent.

-- ─── M1: leads INSERT ─────────────────────────────────────────────────────────
-- Form web công khai (anon/authenticated) chỉ được tạo lead ở shape mặc định:
-- status='new', chưa gán NV, chưa ghi chú nội bộ, chưa hẹn gọi. Ngăn bịa dữ liệu CRM.
DROP POLICY IF EXISTS "public_insert_leads" ON leads;
CREATE POLICY "public_insert_leads" ON leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND assigned_to IS NULL
    AND note IS NULL
    AND follow_up_at IS NULL
  );

-- Admin tạo lead thủ công (createLead) cần đặt status/assigned_to tùy ý → policy riêng.
DROP POLICY IF EXISTS "admin_insert_leads" ON leads;
CREATE POLICY "admin_insert_leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (is_admin());

-- ─── L1: storage user-uploads SELECT ──────────────────────────────────────────
-- Chỉ chủ sở hữu file đọc được (khớp cách UPDATE/DELETE đã scope owner). Ảnh BĐS
-- công khai phục vụ qua bảng properties/user_media, không đọc trực tiếp bucket này.
DROP POLICY IF EXISTS "user_uploads_select" ON storage.objects;
CREATE POLICY "user_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND owner = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
