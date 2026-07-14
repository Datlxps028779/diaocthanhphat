-- =============================================================================
-- Vai trò nhân viên (staff): mở role, thêm is_admin_or_staff(), cấp quyền CRM+tin
-- =============================================================================
-- Đợt 4.2: thêm role 'staff' tách khỏi 'admin'. Staff CHỈ được: chăm sóc khách
-- (leads + lead_activities) + duyệt tin đăng (user_listings + user_media).
-- KHÔNG đụng CMS/settings/users/news/projects (những chỗ đó GIỮ is_admin()).
-- Idempotent.

-- 1. Mở CHECK role để nhận 'staff' (constraint inline tên mặc định profiles_role_check).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'staff', 'admin'));

-- 2. Hàm kiểm admin HOẶC staff (song song is_admin, không thay). Mẫu is_admin().
CREATE OR REPLACE FUNCTION is_admin_or_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
  );
$$;
GRANT EXECUTE ON FUNCTION is_admin_or_staff() TO authenticated, anon;

-- 3. Cấp quyền staff bằng cách đổi policy các bảng CRM+tin sang is_admin_or_staff().
--    Admin vẫn pass (là superset). DELETE/xóa giữ is_admin() (chỉ admin xóa).

-- leads: SELECT + UPDATE cho staff; DELETE giữ admin.
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (is_admin_or_staff());
DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());
-- Tạo lead thủ công (createLead) cho cả staff.
DROP POLICY IF EXISTS "admin_insert_leads" ON leads;
CREATE POLICY "admin_insert_leads" ON leads FOR INSERT TO authenticated WITH CHECK (is_admin_or_staff());

-- lead_activities: SELECT + INSERT cho staff; DELETE giữ admin.
DROP POLICY IF EXISTS "auth_select_lead_activities" ON lead_activities;
CREATE POLICY "auth_select_lead_activities" ON lead_activities FOR SELECT TO authenticated USING (is_admin_or_staff());
DROP POLICY IF EXISTS "auth_insert_lead_activities" ON lead_activities;
CREATE POLICY "auth_insert_lead_activities" ON lead_activities FOR INSERT TO authenticated WITH CHECK (is_admin_or_staff());

-- user_listings: SELECT + UPDATE cho staff (duyệt tin); DELETE giữ admin.
DROP POLICY IF EXISTS "user_listings_admin_select" ON user_listings;
CREATE POLICY "user_listings_admin_select" ON user_listings FOR SELECT TO authenticated USING (is_admin_or_staff());
DROP POLICY IF EXISTS "user_listings_admin_update" ON user_listings;
CREATE POLICY "user_listings_admin_update" ON user_listings FOR UPDATE TO authenticated USING (is_admin_or_staff()) WITH CHECK (is_admin_or_staff());

-- user_media: SELECT cho staff (xem ảnh tin khi duyệt); DELETE giữ admin.
DROP POLICY IF EXISTS "um_select_admin" ON user_media;
CREATE POLICY "um_select_admin" ON user_media FOR SELECT TO authenticated USING (is_admin_or_staff());

NOTIFY pgrst, 'reload schema';
