/*
# RLS Admin Hardening — Vá lỗ hổng phân quyền (Broken Access Control)

## Bối cảnh / Vấn đề
Nhiều bảng trong hệ thống đang dùng policy dạng:
  TO authenticated WITH CHECK (true)
Điều này có nghĩa là BẤT KỲ người dùng nào đã đăng nhập (kể cả user thường vừa
đăng ký tài khoản) đều có toàn quyền INSERT/UPDATE/DELETE lên dữ liệu quan
trọng (properties, news, projects, site_settings, banners, page_blocks...),
thay vì chỉ admin mới được phép — đây là lỗi Broken Access Control (OWASP #1).

Nghiêm trọng hơn: bảng `profiles` cho phép user tự UPDATE row của chính mình
mà không giới hạn cột nào, nghĩa là user thường có thể tự đổi `role` của mình
thành 'admin' (Privilege Escalation) rồi chiếm toàn quyền hệ thống.

Ngoài ra, `user_listings` chỉ có policy cho chủ sở hữu, chưa có policy cho
admin đọc/duyệt tin của người khác — khiến tính năng duyệt tin trong Admin
Panel không được bảo vệ đúng bởi RLS.

## Giải pháp
1. Hàm `is_admin()` (SECURITY DEFINER, STABLE) — nguồn chân lý duy nhất để
   kiểm tra quyền admin dựa trên `profiles.role`, dùng lại trong mọi policy.
2. Trigger `prevent_role_change_by_self` trên `profiles` — chặn user tự đổi
   cột `role`; chỉ admin (is_admin() = true) mới được đổi role của bất kỳ ai.
3. Thêm policy SELECT/UPDATE/ADMIN đầy đủ cho `user_listings`.
4. Thay toàn bộ policy admin-write lỏng lẻo (`USING(true)`) bằng `is_admin()`
   ở: areas, property_types, properties, testimonials, leads, news, projects,
   site_settings, site_content, banners, managed_pages, page_blocks,
   featured_sections, featured_section_items, page_sections, subscribers.
5. Giữ nguyên các policy public SELECT và public INSERT (leads, subscribers)
   vì đây là hành vi thiết kế đúng (form liên hệ / đăng ký không cần đăng nhập).

## Lưu ý vận hành quan trọng
Sau khi chạy migration này, KHÔNG còn user nào tự phong admin được nữa.
Để tạo admin đầu tiên, chạy trực tiếp trên SQL editor của Supabase:
  UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid-của-bạn>';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Hàm is_admin() dùng chung cho mọi policy
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles: chặn tự leo thang đặc quyền (self role escalation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_role_change_by_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) AND NOT is_admin() THEN
    RAISE EXCEPTION 'Không có quyền thay đổi vai trò (role)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_change_by_self ON profiles;
CREATE TRIGGER trg_prevent_role_change_by_self
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change_by_self();

-- Admin có thể xem / sửa mọi profile (vd. quản lý người dùng, đổi role)
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. user_listings: thêm quyền admin (đọc/duyệt/xóa tất cả)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_listings_admin_select" ON user_listings;
CREATE POLICY "user_listings_admin_select" ON user_listings FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_update" ON user_listings;
CREATE POLICY "user_listings_admin_update" ON user_listings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_delete" ON user_listings;
CREATE POLICY "user_listings_admin_delete" ON user_listings FOR DELETE
  TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. areas
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_areas" ON areas;
CREATE POLICY "auth_insert_areas" ON areas FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_areas" ON areas;
CREATE POLICY "auth_update_areas" ON areas FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_areas" ON areas;
CREATE POLICY "auth_delete_areas" ON areas FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. property_types
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_property_types" ON property_types;
CREATE POLICY "auth_insert_property_types" ON property_types FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_property_types" ON property_types;
CREATE POLICY "auth_update_property_types" ON property_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_property_types" ON property_types;
CREATE POLICY "auth_delete_property_types" ON property_types FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. properties
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_properties" ON properties;
CREATE POLICY "auth_insert_properties" ON properties FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_properties" ON properties;
CREATE POLICY "auth_update_properties" ON properties FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_properties" ON properties;
CREATE POLICY "auth_delete_properties" ON properties FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. testimonials
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_testimonials" ON testimonials;
CREATE POLICY "auth_insert_testimonials" ON testimonials FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_testimonials" ON testimonials;
CREATE POLICY "auth_update_testimonials" ON testimonials FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_testimonials" ON testimonials;
CREATE POLICY "auth_delete_testimonials" ON testimonials FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. leads (INSERT vẫn public — form liên hệ không cần đăng nhập)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. news
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "news_insert_admin" ON news;
CREATE POLICY "news_insert_admin" ON news FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_update_admin" ON news;
CREATE POLICY "news_update_admin" ON news FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_delete_admin" ON news;
CREATE POLICY "news_delete_admin" ON news FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. projects
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_insert_admin" ON projects;
CREATE POLICY "projects_insert_admin" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "projects_update_admin" ON projects;
CREATE POLICY "projects_update_admin" ON projects FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "projects_delete_admin" ON projects;
CREATE POLICY "projects_delete_admin" ON projects FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. site_settings
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_site_settings" ON site_settings;
CREATE POLICY "auth_insert_site_settings" ON site_settings FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_site_settings" ON site_settings;
CREATE POLICY "auth_update_site_settings" ON site_settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_site_settings" ON site_settings;
CREATE POLICY "auth_delete_site_settings" ON site_settings FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. site_content
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_site_content" ON site_content;
CREATE POLICY "auth_insert_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_site_content" ON site_content;
CREATE POLICY "auth_update_site_content" ON site_content FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_site_content" ON site_content;
CREATE POLICY "auth_delete_site_content" ON site_content FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. banners
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_banners" ON banners;
CREATE POLICY "auth_insert_banners" ON banners FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_banners" ON banners;
CREATE POLICY "auth_update_banners" ON banners FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_banners" ON banners;
CREATE POLICY "auth_delete_banners" ON banners FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. managed_pages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_pages" ON managed_pages;
CREATE POLICY "auth_insert_pages" ON managed_pages FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_pages" ON managed_pages;
CREATE POLICY "auth_update_pages" ON managed_pages FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_pages" ON managed_pages;
CREATE POLICY "auth_delete_pages" ON managed_pages FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. page_blocks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_blocks" ON page_blocks;
CREATE POLICY "auth_insert_blocks" ON page_blocks FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_blocks" ON page_blocks;
CREATE POLICY "auth_update_blocks" ON page_blocks FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_blocks" ON page_blocks;
CREATE POLICY "auth_delete_blocks" ON page_blocks FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. featured_sections
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fs_insert" ON featured_sections;
CREATE POLICY "fs_insert" ON featured_sections FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fs_update" ON featured_sections;
CREATE POLICY "fs_update" ON featured_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fs_delete" ON featured_sections;
CREATE POLICY "fs_delete" ON featured_sections FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. featured_section_items
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fsi_insert" ON featured_section_items;
CREATE POLICY "fsi_insert" ON featured_section_items FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fsi_update" ON featured_section_items;
CREATE POLICY "fsi_update" ON featured_section_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fsi_delete" ON featured_section_items;
CREATE POLICY "fsi_delete" ON featured_section_items FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. page_sections
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "page_sections_update" ON page_sections;
CREATE POLICY "page_sections_update" ON page_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "page_sections_insert" ON page_sections;
CREATE POLICY "page_sections_insert" ON page_sections FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. subscribers (INSERT vẫn public — đăng ký newsletter không cần đăng nhập)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_subscribers" ON subscribers;
CREATE POLICY "auth_select_subscribers" ON subscribers FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "auth_update_subscribers" ON subscribers;
CREATE POLICY "auth_update_subscribers" ON subscribers FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_subscribers" ON subscribers;
CREATE POLICY "auth_delete_subscribers" ON subscribers FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. districts (đã dùng EXISTS profile check — chuẩn hóa lại dùng is_admin())
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "districts_insert_admin" ON districts;
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "districts_update_admin" ON districts;
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "districts_delete_admin" ON districts;
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (is_admin());
