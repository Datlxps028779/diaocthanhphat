-- =============================================================================
-- ALL IN ONE MIGRATION - Tự động chạy migrations mới
-- =============================================================================

-- BƯỚC 1: Storage Buckets RLS Policies
-- Lưu ý: Cần tạo bucket trước trong Supabase Dashboard hoặc CLI

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

-- Thêm cấu hình bucket prefix vào site_settings
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('admin_bucket_prefix', 'admin-uploads', 'Bucket prefix cho admin', 'storage', 'text'),
  ('user_bucket_prefix', 'user-uploads', 'Bucket prefix cho người dùng', 'storage', 'text')
ON CONFLICT (key) DO NOTHING;

-- BƯỚC 2: User Favorites Table
CREATE TABLE IF NOT EXISTS user_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_property_id ON user_favorites(property_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uf_select" ON user_favorites;
CREATE POLICY "uf_select" ON user_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_insert" ON user_favorites;
CREATE POLICY "uf_insert" ON user_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_delete" ON user_favorites;
CREATE POLICY "uf_delete" ON user_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_update" ON user_favorites;
CREATE POLICY "uf_update" ON user_favorites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- BƯỚC 3: Auto Slug Functions
CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
DECLARE
  slug text;
  base_slug text;
BEGIN
  base_slug := regexp_replace(
    lower(title),
    '[àáạảãâầấậẩẫăằắặẳẵ]', 'a', 'g'
  ) || regexp_replace(
    lower(title),
    '[èéẹẻẽêềếệểễ]', 'e', 'g'
  ) || regexp_replace(
    lower(title),
    '[ìíịỉĩ]', 'i', 'g'
  ) || regexp_replace(
    lower(title),
    '[òóọỏõôồốộổỗơờớợởỡ]', 'o', 'g'
  ) || regexp_replace(
    lower(title),
    '[ùúụủũưừứựửữ]', 'u', 'g'
  ) || regexp_replace(
    lower(title),
    '[ỳýỵỷỹ]', 'y', 'g'
  ) || regexp_replace(
    lower(title),
    '[đ]', 'd', 'g'
  );
  
  slug := regexp_replace(
    regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  );
  slug := trim(both '-' from slug);
  slug := substring(slug, 1, 100);
  
  RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);

CREATE OR REPLACE FUNCTION set_property_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_slug ON properties;
CREATE TRIGGER trg_properties_slug
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION set_property_slug();

ALTER TABLE news ADD COLUMN IF NOT EXISTS slug text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);

CREATE OR REPLACE FUNCTION set_news_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_news_slug ON news;
CREATE TRIGGER trg_news_slug
  BEFORE INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION set_news_slug();

-- BƯỚC 4: Max File Size Setting
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('max_file_size', '3', 'Dung lượng ảnh tối đa (MB)', 'storage', 'number')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- BƯỚC 5: RLS Admin Hardening — Vá lỗ hổng phân quyền (Broken Access Control)
-- Xem chi tiết giải thích tại: supabase/migrations/20260704300000_rls_admin_hardening.sql
-- =============================================================================

-- 5.1 Hàm is_admin() dùng chung cho mọi policy
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

-- 5.2 profiles: chặn tự leo thang đặc quyền (self role escalation)
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

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 5.3 user_listings: thêm quyền admin (đọc/duyệt/xóa tất cả)
DROP POLICY IF EXISTS "user_listings_admin_select" ON user_listings;
CREATE POLICY "user_listings_admin_select" ON user_listings FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_update" ON user_listings;
CREATE POLICY "user_listings_admin_update" ON user_listings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_delete" ON user_listings;
CREATE POLICY "user_listings_admin_delete" ON user_listings FOR DELETE
  TO authenticated USING (is_admin());

-- 5.4 areas
DROP POLICY IF EXISTS "auth_insert_areas" ON areas;
CREATE POLICY "auth_insert_areas" ON areas FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_areas" ON areas;
CREATE POLICY "auth_update_areas" ON areas FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_areas" ON areas;
CREATE POLICY "auth_delete_areas" ON areas FOR DELETE TO authenticated USING (is_admin());

-- 5.5 property_types
DROP POLICY IF EXISTS "auth_insert_property_types" ON property_types;
CREATE POLICY "auth_insert_property_types" ON property_types FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_property_types" ON property_types;
CREATE POLICY "auth_update_property_types" ON property_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_property_types" ON property_types;
CREATE POLICY "auth_delete_property_types" ON property_types FOR DELETE TO authenticated USING (is_admin());

-- 5.6 properties
DROP POLICY IF EXISTS "auth_insert_properties" ON properties;
CREATE POLICY "auth_insert_properties" ON properties FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_properties" ON properties;
CREATE POLICY "auth_update_properties" ON properties FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_properties" ON properties;
CREATE POLICY "auth_delete_properties" ON properties FOR DELETE TO authenticated USING (is_admin());

-- 5.7 testimonials
DROP POLICY IF EXISTS "auth_insert_testimonials" ON testimonials;
CREATE POLICY "auth_insert_testimonials" ON testimonials FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_testimonials" ON testimonials;
CREATE POLICY "auth_update_testimonials" ON testimonials FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_testimonials" ON testimonials;
CREATE POLICY "auth_delete_testimonials" ON testimonials FOR DELETE TO authenticated USING (is_admin());

-- 5.8 leads (INSERT vẫn public — form liên hệ không cần đăng nhập)
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (is_admin());

-- 5.9 news
DROP POLICY IF EXISTS "news_insert_admin" ON news;
CREATE POLICY "news_insert_admin" ON news FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "news_update_admin" ON news;
CREATE POLICY "news_update_admin" ON news FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "news_delete_admin" ON news;
CREATE POLICY "news_delete_admin" ON news FOR DELETE TO authenticated USING (is_admin());

-- 5.10 projects
DROP POLICY IF EXISTS "projects_insert_admin" ON projects;
CREATE POLICY "projects_insert_admin" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "projects_update_admin" ON projects;
CREATE POLICY "projects_update_admin" ON projects FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "projects_delete_admin" ON projects;
CREATE POLICY "projects_delete_admin" ON projects FOR DELETE TO authenticated USING (is_admin());

-- 5.11 site_settings
DROP POLICY IF EXISTS "auth_insert_site_settings" ON site_settings;
CREATE POLICY "auth_insert_site_settings" ON site_settings FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_site_settings" ON site_settings;
CREATE POLICY "auth_update_site_settings" ON site_settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_site_settings" ON site_settings;
CREATE POLICY "auth_delete_site_settings" ON site_settings FOR DELETE TO authenticated USING (is_admin());

-- 5.12 site_content
DROP POLICY IF EXISTS "auth_insert_site_content" ON site_content;
CREATE POLICY "auth_insert_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_site_content" ON site_content;
CREATE POLICY "auth_update_site_content" ON site_content FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_site_content" ON site_content;
CREATE POLICY "auth_delete_site_content" ON site_content FOR DELETE TO authenticated USING (is_admin());

-- 5.13 banners
DROP POLICY IF EXISTS "auth_insert_banners" ON banners;
CREATE POLICY "auth_insert_banners" ON banners FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_banners" ON banners;
CREATE POLICY "auth_update_banners" ON banners FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_banners" ON banners;
CREATE POLICY "auth_delete_banners" ON banners FOR DELETE TO authenticated USING (is_admin());

-- 5.14 managed_pages
DROP POLICY IF EXISTS "auth_insert_pages" ON managed_pages;
CREATE POLICY "auth_insert_pages" ON managed_pages FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_pages" ON managed_pages;
CREATE POLICY "auth_update_pages" ON managed_pages FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_pages" ON managed_pages;
CREATE POLICY "auth_delete_pages" ON managed_pages FOR DELETE TO authenticated USING (is_admin());

-- 5.15 page_blocks
DROP POLICY IF EXISTS "auth_insert_blocks" ON page_blocks;
CREATE POLICY "auth_insert_blocks" ON page_blocks FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_update_blocks" ON page_blocks;
CREATE POLICY "auth_update_blocks" ON page_blocks FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_blocks" ON page_blocks;
CREATE POLICY "auth_delete_blocks" ON page_blocks FOR DELETE TO authenticated USING (is_admin());

-- 5.16 featured_sections
DROP POLICY IF EXISTS "fs_insert" ON featured_sections;
CREATE POLICY "fs_insert" ON featured_sections FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "fs_update" ON featured_sections;
CREATE POLICY "fs_update" ON featured_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "fs_delete" ON featured_sections;
CREATE POLICY "fs_delete" ON featured_sections FOR DELETE TO authenticated USING (is_admin());

-- 5.17 featured_section_items
DROP POLICY IF EXISTS "fsi_insert" ON featured_section_items;
CREATE POLICY "fsi_insert" ON featured_section_items FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "fsi_update" ON featured_section_items;
CREATE POLICY "fsi_update" ON featured_section_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "fsi_delete" ON featured_section_items;
CREATE POLICY "fsi_delete" ON featured_section_items FOR DELETE TO authenticated USING (is_admin());

-- 5.18 page_sections
DROP POLICY IF EXISTS "page_sections_update" ON page_sections;
CREATE POLICY "page_sections_update" ON page_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "page_sections_insert" ON page_sections;
CREATE POLICY "page_sections_insert" ON page_sections FOR INSERT TO authenticated WITH CHECK (is_admin());

-- 5.19 subscribers (INSERT vẫn public — đăng ký newsletter không cần đăng nhập)
DROP POLICY IF EXISTS "auth_select_subscribers" ON subscribers;
CREATE POLICY "auth_select_subscribers" ON subscribers FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "auth_update_subscribers" ON subscribers;
CREATE POLICY "auth_update_subscribers" ON subscribers FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "auth_delete_subscribers" ON subscribers;
CREATE POLICY "auth_delete_subscribers" ON subscribers FOR DELETE TO authenticated USING (is_admin());

-- 5.20 districts (chuẩn hóa lại dùng is_admin())
DROP POLICY IF EXISTS "districts_insert_admin" ON districts;
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "districts_update_admin" ON districts;
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "districts_delete_admin" ON districts;
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (is_admin());

-- =============================================================================
-- BƯỚC 6: User Media Library — Thư viện ảnh riêng cho từng tài khoản
-- Xem chi tiết tại: supabase/migrations/20260704400000_user_media_library.sql
-- =============================================================================

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

