-- =============================================================================
-- BĐS Bình Dương – Master Schema Export
-- Tương thích: PostgreSQL 14+, Supabase
-- Cách dùng: Chạy toàn bộ file này trên database mới (psql hoặc Supabase SQL Editor)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 1: ENABLE EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 2: TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Areas (Khu vực / Tỉnh thành)
CREATE TABLE IF NOT EXISTS areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  image_url   text,
  slug        text UNIQUE NOT NULL,
  order_index integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Property types (Loại BĐS)
CREATE TABLE IF NOT EXISTS property_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  icon       text,
  created_at timestamptz DEFAULT now()
);

-- Districts (Quận/Huyện – Province → District taxonomy)
CREATE TABLE IF NOT EXISTS districts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     uuid REFERENCES areas(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  order_index integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS districts_slug_idx ON districts(slug);

-- Properties (Bất động sản chính)
CREATE TABLE IF NOT EXISTS properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  price             numeric NOT NULL,
  price_unit        text NOT NULL DEFAULT 'tỷ',
  price_label       text,
  price_per_month   numeric,
  listing_type      text NOT NULL DEFAULT 'mua_ban'
                    CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue')),
  area_sqm          numeric,
  address           text,
  city              text NOT NULL,
  district          text,
  area_id           uuid REFERENCES areas(id) ON DELETE SET NULL,
  district_id       uuid REFERENCES districts(id) ON DELETE SET NULL,
  property_type_id  uuid REFERENCES property_types(id) ON DELETE SET NULL,
  image_url         text,
  images            text[],
  badge             text,
  badge_color       text DEFAULT 'red',
  legal_status      text,
  is_featured       boolean DEFAULT false,
  is_hot            boolean DEFAULT false,
  is_active         boolean DEFAULT true,
  views             integer DEFAULT 0,
  contact_name      text,
  contact_phone     text,
  contact_zalo      text,
  bedrooms          integer,
  bathrooms         integer,
  floor_count       integer,
  floor_number      integer,
  direction         text,
  road_width        numeric,
  frontage          numeric,
  amenities         text[],
  latitude          decimal(10,8),
  longitude         decimal(11,8),
  formatted_address text,
  vr_tour_url       text,
  video_url         text,
  tags              text[] DEFAULT '{}',
  meta_title        text,
  meta_description  text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_area_id       ON properties(area_id);
CREATE INDEX IF NOT EXISTS idx_properties_district_id   ON properties(district_id);
CREATE INDEX IF NOT EXISTS idx_properties_type_id       ON properties(property_type_id);
CREATE INDEX IF NOT EXISTS idx_properties_listing_type  ON properties(listing_type);
CREATE INDEX IF NOT EXISTS idx_properties_is_featured   ON properties(is_featured);
CREATE INDEX IF NOT EXISTS idx_properties_is_hot        ON properties(is_hot);
CREATE INDEX IF NOT EXISTS idx_properties_is_active     ON properties(is_active);
CREATE INDEX IF NOT EXISTS idx_properties_city          ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_created_at    ON properties(created_at DESC);

-- Testimonials (Đánh giá khách hàng)
CREATE TABLE IF NOT EXISTS testimonials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  location   text,
  content    text NOT NULL,
  rating     integer DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  avatar_url text,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Leads (Liên hệ / Tư vấn)
CREATE TABLE IF NOT EXISTS leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL,
  phone        text NOT NULL,
  area_interest text,
  message      text,
  property_id  uuid REFERENCES properties(id) ON DELETE SET NULL,
  status       text DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- News (Tin tức)
CREATE TABLE IF NOT EXISTS news (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  slug         text UNIQUE NOT NULL,
  excerpt      text,
  content      text,
  image_url    text,
  category     text NOT NULL DEFAULT 'Thị trường',
  author       text DEFAULT 'Ban biên tập',
  is_published boolean DEFAULT true,
  views        integer DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Projects (Dự án)
CREATE TABLE IF NOT EXISTS projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  location      text,
  city          text,
  area_id       uuid REFERENCES areas(id) ON DELETE SET NULL,
  developer     text,
  total_units   integer,
  sold_units    integer DEFAULT 0,
  price_from    numeric,
  price_to      numeric,
  price_unit    text DEFAULT 'tỷ',
  image_url     text,
  images        text[],
  phase         text DEFAULT 'Đang mở bán',
  handover_date text,
  legal_status  text,
  amenities     text[],
  is_featured   boolean DEFAULT false,
  is_active     boolean DEFAULT true,
  latitude      decimal(10,8),
  longitude     decimal(11,8),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Profiles (người dùng)
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone        text,
  avatar_url   text,
  role         text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- User Listings (Tin đăng của người dùng – chờ duyệt)
CREATE TABLE IF NOT EXISTS user_listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason    text,
  title            text NOT NULL,
  description      text,
  price            numeric NOT NULL,
  price_unit       text NOT NULL DEFAULT 'tỷ',
  price_label      text,
  listing_type     text NOT NULL DEFAULT 'mua_ban'
                   CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue')),
  price_per_month  numeric,
  area_sqm         numeric,
  address          text,
  city             text NOT NULL,
  district         text,
  area_id          uuid REFERENCES areas(id) ON DELETE SET NULL,
  district_id      uuid REFERENCES districts(id) ON DELETE SET NULL,
  property_type_id uuid REFERENCES property_types(id) ON DELETE SET NULL,
  image_url        text,
  images           text[],
  legal_status     text,
  bedrooms         integer,
  bathrooms        integer,
  direction        text,
  contact_name     text,
  contact_phone    text,
  contact_zalo     text,
  amenities        text[],
  latitude         decimal(10,8),
  longitude        decimal(11,8),
  formatted_address text,
  vr_tour_url      text,
  video_url        text,
  tags             text[] DEFAULT '{}',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Site Settings (Cấu hình hệ thống)
CREATE TABLE IF NOT EXISTS site_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,
  value      text,
  label      text NOT NULL,
  group_name text NOT NULL DEFAULT 'general',
  type       text NOT NULL DEFAULT 'text',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Site Content (CMS nội dung)
CREATE TABLE IF NOT EXISTS site_content (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section     text NOT NULL,
  key         text NOT NULL,
  value       text,
  label       text NOT NULL,
  type        text NOT NULL DEFAULT 'text',
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(section, key)
);
CREATE INDEX IF NOT EXISTS idx_site_content_section ON site_content(section, order_index);

-- Banners (Quảng cáo / Banner)
CREATE TABLE IF NOT EXISTS banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  subtitle    text,
  cta_text    text,
  cta_link    text,
  image_url   text,
  bg_color    text DEFAULT '#dc2626',
  position    text NOT NULL DEFAULT 'hero'
              CHECK (position IN ('hero','sidebar','footer_cta','listings_top')),
  order_index integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  impressions integer DEFAULT 0,
  clicks      integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banners_position ON banners(position, order_index) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 3: ROW LEVEL SECURITY (RLS) — Hardened with is_admin()
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE areas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials    ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE news            ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_content    ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners         ENABLE ROW LEVEL SECURITY;

-- Hàm is_admin() dùng chung cho mọi policy admin-write
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

-- Trigger chặn user tự đổi role (Privilege Escalation)
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

-- Areas (public SELECT, admin-only write)
DROP POLICY IF EXISTS "areas_select" ON areas;
CREATE POLICY "areas_select" ON areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "areas_insert" ON areas;
CREATE POLICY "areas_insert" ON areas FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "areas_update" ON areas;
CREATE POLICY "areas_update" ON areas FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "areas_delete" ON areas;
CREATE POLICY "areas_delete" ON areas FOR DELETE TO authenticated USING (is_admin());

-- Property Types (public SELECT, admin-only write)
DROP POLICY IF EXISTS "ptypes_select" ON property_types;
CREATE POLICY "ptypes_select" ON property_types FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ptypes_insert" ON property_types;
CREATE POLICY "ptypes_insert" ON property_types FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ptypes_update" ON property_types;
CREATE POLICY "ptypes_update" ON property_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ptypes_delete" ON property_types;
CREATE POLICY "ptypes_delete" ON property_types FOR DELETE TO authenticated USING (is_admin());

-- Districts (public SELECT, admin-only write)
DROP POLICY IF EXISTS "districts_select_public" ON districts;
CREATE POLICY "districts_select_public" ON districts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "districts_insert_admin" ON districts;
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "districts_update_admin" ON districts;
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "districts_delete_admin" ON districts;
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (is_admin());

-- Properties (public SELECT active, admin-only write)
DROP POLICY IF EXISTS "props_select" ON properties;
CREATE POLICY "props_select" ON properties FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "props_insert" ON properties;
CREATE POLICY "props_insert" ON properties FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "props_update" ON properties;
CREATE POLICY "props_update" ON properties FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "props_delete" ON properties;
CREATE POLICY "props_delete" ON properties FOR DELETE TO authenticated USING (is_admin());

-- Testimonials (public SELECT active, admin-only write)
DROP POLICY IF EXISTS "test_select" ON testimonials;
CREATE POLICY "test_select" ON testimonials FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "test_insert" ON testimonials;
CREATE POLICY "test_insert" ON testimonials FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "test_update" ON testimonials;
CREATE POLICY "test_update" ON testimonials FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "test_delete" ON testimonials;
CREATE POLICY "test_delete" ON testimonials FOR DELETE TO authenticated USING (is_admin());

-- Leads (public INSERT — form liên hệ, admin-only read/update/delete)
DROP POLICY IF EXISTS "leads_insert" ON leads;
CREATE POLICY "leads_insert" ON leads FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "leads_select" ON leads;
CREATE POLICY "leads_select" ON leads FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "leads_delete" ON leads;
CREATE POLICY "leads_delete" ON leads FOR DELETE TO authenticated USING (is_admin());

-- News (public SELECT published, admin-only write)
DROP POLICY IF EXISTS "news_select" ON news;
CREATE POLICY "news_select" ON news FOR SELECT TO anon, authenticated USING (is_published = true);
DROP POLICY IF EXISTS "news_insert" ON news;
CREATE POLICY "news_insert" ON news FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "news_update" ON news;
CREATE POLICY "news_update" ON news FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "news_delete" ON news;
CREATE POLICY "news_delete" ON news FOR DELETE TO authenticated USING (is_admin());

-- Projects (public SELECT active, admin-only write)
DROP POLICY IF EXISTS "proj_select" ON projects;
CREATE POLICY "proj_select" ON projects FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "proj_insert" ON projects;
CREATE POLICY "proj_insert" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "proj_update" ON projects;
CREATE POLICY "proj_update" ON projects FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "proj_delete" ON projects;
CREATE POLICY "proj_delete" ON projects FOR DELETE TO authenticated USING (is_admin());

-- Profiles (user sees own, admin sees all + can change role)
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin());
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin()) WITH CHECK (auth.uid() = id OR is_admin());

-- User Listings (user CRUD own, admin read/update/delete all)
DROP POLICY IF EXISTS "ul_select" ON user_listings;
CREATE POLICY "ul_select" ON user_listings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "ul_insert" ON user_listings;
CREATE POLICY "ul_insert" ON user_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ul_update" ON user_listings;
CREATE POLICY "ul_update" ON user_listings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending') WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ul_delete" ON user_listings;
CREATE POLICY "ul_delete" ON user_listings FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_admin());

-- Site Settings (public SELECT, admin-only write)
DROP POLICY IF EXISTS "ss_select" ON site_settings;
CREATE POLICY "ss_select" ON site_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ss_insert" ON site_settings;
CREATE POLICY "ss_insert" ON site_settings FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ss_update" ON site_settings;
CREATE POLICY "ss_update" ON site_settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ss_delete" ON site_settings;
CREATE POLICY "ss_delete" ON site_settings FOR DELETE TO authenticated USING (is_admin());

-- Site Content (public SELECT, admin-only write)
DROP POLICY IF EXISTS "sc_select" ON site_content;
CREATE POLICY "sc_select" ON site_content FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sc_insert" ON site_content;
CREATE POLICY "sc_insert" ON site_content FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "sc_update" ON site_content;
CREATE POLICY "sc_update" ON site_content FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "sc_delete" ON site_content;
CREATE POLICY "sc_delete" ON site_content FOR DELETE TO authenticated USING (is_admin());

-- Banners (public SELECT, admin-only write)
DROP POLICY IF EXISTS "ban_select" ON banners;
CREATE POLICY "ban_select" ON banners FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ban_insert" ON banners;
CREATE POLICY "ban_insert" ON banners FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ban_update" ON banners;
CREATE POLICY "ban_update" ON banners FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "ban_delete" ON banners;
CREATE POLICY "ban_delete" ON banners FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 4: FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_updated_at  ON properties;
DROP TRIGGER IF EXISTS trg_user_listings_updated_at ON user_listings;
DROP TRIGGER IF EXISTS trg_news_updated_at          ON news;
DROP TRIGGER IF EXISTS trg_projects_updated_at      ON projects;
DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON site_settings;
DROP TRIGGER IF EXISTS trg_site_content_updated_at  ON site_content;
DROP TRIGGER IF EXISTS trg_banners_updated_at       ON banners;
DROP TRIGGER IF EXISTS trg_profiles_updated_at      ON profiles;

CREATE TRIGGER trg_properties_updated_at   BEFORE UPDATE ON properties   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_listings_updated_at BEFORE UPDATE ON user_listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_news_updated_at          BEFORE UPDATE ON news          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated_at      BEFORE UPDATE ON projects      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_site_content_updated_at  BEFORE UPDATE ON site_content  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_banners_updated_at       BEFORE UPDATE ON banners       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON profiles      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- BƯỚC 5: SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- Areas
INSERT INTO areas (name, description, slug, order_index, image_url) VALUES
('TP. Hồ Chí Minh', 'Trung tâm kinh tế - tài chính lớn nhất cả nước.', 'tp-hcm', 1, 'https://images.pexels.com/photos/6177618/pexels-photo-6177618.jpeg'),
('Bình Dương', 'Thủ phủ công nghiệp, hạ tầng đồng bộ, thu hút FDI.', 'binh-duong', 2, 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg'),
('Đồng Nai', 'Sân bay Long Thành, hạ tầng kết nối hoàn thiện.', 'dong-nai', 3, 'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg'),
('Bình Phước', 'Quỹ đất lớn, giá còn thấp, tiềm năng tăng giá mạnh.', 'binh-phuoc', 4, 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg')
ON CONFLICT (slug) DO NOTHING;

-- Property Types
INSERT INTO property_types (name, slug) VALUES
('Đất nền', 'dat-nen'),
('Nhà phố', 'nha-pho'),
('Biệt thự', 'biet-thu'),
('Căn hộ', 'can-ho'),
('Khu công nghiệp', 'khu-cong-nghiep'),
('Đất dự án', 'dat-du-an'),
('Nhà ở xã hội', 'nha-o-xa-hoi'),
('Văn phòng', 'van-phong')
ON CONFLICT (slug) DO NOTHING;

-- Districts – Bình Dương
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Thủ Dầu Một', 'thu-dau-mot', 1), ('Dĩ An', 'di-an', 2),
  ('Thuận An', 'thuan-an', 3), ('Bến Cát', 'ben-cat', 4),
  ('Bàu Bàng', 'bau-bang', 5), ('Tân Uyên', 'tan-uyen', 6),
  ('Phú Giáo', 'phu-giao', 7), ('Dầu Tiếng', 'dau-tieng', 8)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Dương%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug);

-- Districts – Bình Phước
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Đồng Xoài', 'dong-xoai', 1), ('Bình Long', 'binh-long', 2),
  ('Phước Long', 'phuoc-long', 3), ('Chơn Thành', 'chon-thanh', 4),
  ('Đồng Phú', 'dong-phu', 5), ('Bù Đăng', 'bu-dang', 6),
  ('Hớn Quản', 'hon-quan', 7), ('Lộc Ninh', 'loc-ninh', 8),
  ('Bù Gia Mập', 'bu-gia-map', 9), ('Bù Đốp', 'bu-dop', 10)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Phước%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug);

-- Districts – Đồng Nai
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Biên Hòa', 'bien-hoa', 1), ('Long Khánh', 'long-khanh', 2),
  ('Nhơn Trạch', 'nhon-trach', 3), ('Long Thành', 'long-thanh', 4),
  ('Trảng Bom', 'trang-bom', 5), ('Xuân Lộc', 'xuan-loc', 6),
  ('Thống Nhất', 'thong-nhat', 7), ('Định Quán', 'dinh-quan', 8),
  ('Tân Phú', 'tan-phu-dong-nai', 9), ('Vĩnh Cửu', 'vinh-cuu', 10),
  ('Cẩm Mỹ', 'cam-my', 11)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Đồng Nai%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug);

-- Districts – TP. Hồ Chí Minh
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Quận 1', 'quan-1-hcm', 1), ('Thủ Đức', 'thu-duc-hcm', 2),
  ('Quận 7', 'quan-7-hcm', 3), ('Bình Thạnh', 'binh-thanh-hcm', 4),
  ('Gò Vấp', 'go-vap-hcm', 5), ('Tân Bình', 'tan-binh-hcm', 6),
  ('Nhà Bè', 'nha-be-hcm', 7), ('Hóc Môn', 'hoc-mon-hcm', 8),
  ('Bình Chánh', 'binh-chanh-hcm', 9), ('Củ Chi', 'cu-chi-hcm', 10)
) AS d(name, slug, ord) ON true
WHERE (a.name ILIKE '%Hồ Chí Minh%' OR a.slug = 'tp-hcm')
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug);

-- Sample Properties
INSERT INTO properties (title, price, price_unit, price_label, area_sqm, address, city, district, badge, badge_color, legal_status, is_featured, is_hot, listing_type, image_url, description, contact_name, contact_phone, bedrooms, bathrooms, latitude, longitude) VALUES
('Đất nền sổ đỏ KDC Phú Hồng Thịnh 8', 2.15, 'tỷ', '2,15 tỷ / nền', 100, 'Dĩ An', 'Bình Dương', 'Dĩ An', 'MỚI NHẤT', 'green', 'Thổ cư 100%', true, false, 'mua_ban', 'https://images.pexels.com/photos/1115804/pexels-photo-1115804.jpeg', 'Đất nền sổ đỏ trao tay, pháp lý minh bạch, vị trí đắc địa tại Dĩ An, Bình Dương.', 'Nguyễn Văn A', '0901234567', null, null, 10.9077, 106.7698),
('Nhà phố 1 trệt 2 lầu KDC Hiệp Thành 3', 3.85, 'tỷ', '3,85 tỷ / căn', 80, 'Thủ Dầu Một', 'Bình Dương', 'Thủ Dầu Một', 'ĐANG HOT', 'orange', 'Sổ hồng riêng', true, true, 'mua_ban', 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg', 'Nhà phố thiết kế hiện đại, full nội thất, an ninh 24/7.', 'Trần Thị B', '0901234568', 3, 2, 10.9798, 106.6525),
('Đất nền ven sông Đồng Nai', 1.95, 'tỷ', '1,95 tỷ / nền', 120, 'Biên Hòa', 'Đồng Nai', 'Biên Hòa', 'NỔI BẬT', 'red', 'Thổ cư 100%', true, false, 'mua_ban', 'https://images.pexels.com/photos/280222/pexels-photo-280222.jpeg', 'Đất nền cạnh sông, không khí trong lành, tiềm năng tăng giá cao.', 'Lê Văn C', '0901234569', null, null, 10.9577, 106.8427),
('Đất nền KCN Becamex Chơn Thành', 850, 'triệu', '850 triệu / nền', 150, 'Chơn Thành', 'Bình Phước', 'Chơn Thành', 'TIỀM NĂNG', 'blue', 'Sổ hồng riêng', true, false, 'mua_ban', 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg', 'Đất nền liền kề khu công nghiệp Becamex, thanh khoản cao.', 'Phạm Thị D', '0901234570', null, null, 11.4565, 106.6102),
('Căn hộ cho thuê trung tâm Thủ Dầu Một', 8, 'triệu', '8 triệu/tháng', 45, 'Thủ Dầu Một', 'Bình Dương', 'Thủ Dầu Một', null, 'red', null, false, true, 'cho_thue', 'https://images.pexels.com/photos/1546168/pexels-photo-1546168.jpeg', 'Căn hộ đầy đủ nội thất, an ninh tốt, gần trung tâm.', 'Hoàng Văn E', '0901234571', 1, 1, 10.9798, 106.6525)
ON CONFLICT DO NOTHING;

-- Testimonials
INSERT INTO testimonials (name, location, content, rating) VALUES
('Anh Minh Tuấn', 'Thủ Đức, TP. Hồ Chí Minh', 'Tôi đã đầu tư 3 nền đất tại đây, thông tin rõ ràng, hỗ trợ tận tình và thủ tục dễ dàng.', 5),
('Chị Hoàng Yến', 'Thuận An, Bình Dương', 'Nhờ bên tư vấn mà tôi mua được căn nhà ưng ý, vị trí tốt, thanh toán linh hoạt.', 5),
('Anh Quốc Huy', 'Biên Hòa, Đồng Nai', 'Thông tin rất minh bạch, tôi tin tưởng trao giao dịch. Rất đáng tin cậy!', 5)
ON CONFLICT DO NOTHING;

-- Site Settings
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('site_name',         'BĐS Bình Dương',                          'Tên website',          'general',  'text'),
  ('site_logo_text',    'BĐS BÌNH DƯƠNG',                          'Text logo',            'general',  'text'),
  ('site_logo_sub',     'Bất Động Sản Uy Tín',                     'Sub text logo',        'general',  'text'),
  ('site_logo_url',     '',                                         'URL Logo',             'general',  'url'),
  ('site_favicon_url',  '',                                         'URL Favicon',          'general',  'url'),
  ('primary_color',     '#dc2626',                                  'Màu chủ đạo',          'general',  'color'),
  ('phone_main',        '0901 234 567',                             'SĐT chính',            'contact',  'phone'),
  ('phone_hotline',     '0901 234 567',                             'Hotline',              'contact',  'phone'),
  ('phone_secondary',   '',                                         'Hotline phụ',          'contact',  'phone'),
  ('zalo_link',         'https://zalo.me/0901234567',              'Link Zalo',            'contact',  'url'),
  ('zalo_oa_id',        '',                                         'Zalo OA ID',           'contact',  'text'),
  ('email',             'info@bdsbinhduong.vn',                    'Email liên hệ',        'contact',  'text'),
  ('address',           'Thủ Dầu Một, Bình Dương',                'Địa chỉ văn phòng',    'contact',  'text'),
  ('working_hours',     'Thứ 2 - Thứ 7: 8:00 - 17:30',           'Giờ làm việc',         'contact',  'text'),
  ('webhook_url',       '',                                         'Webhook CRM URL',      'contact',  'url'),
  ('facebook_url',      '',                                         'Facebook URL',         'social',   'url'),
  ('social_facebook',   '',                                         'Facebook (alt)',        'social',   'url'),
  ('youtube_url',       '',                                         'YouTube URL',          'social',   'url'),
  ('social_youtube',    '',                                         'YouTube (alt)',         'social',   'url'),
  ('social_tiktok',     '',                                         'TikTok URL',           'social',   'url'),
  ('social_instagram',  '',                                         'Instagram URL',        'social',   'url'),
  ('social_telegram',   '',                                         'Telegram URL',         'social',   'url'),
  ('footer_description','Nền tảng bất động sản uy tín tại Bình Dương và các tỉnh lân cận.','Mô tả footer','general','textarea'),
  ('footer_copyright',  '© 2025 BĐS Bình Dương. Tất cả quyền được bảo lưu.','Bản quyền footer','footer','text'),
  ('footer_address',    'Bình Dương, Việt Nam',                    'Địa chỉ footer',       'footer',   'text'),
  ('meta_title',        'BĐS Bình Dương – Mua Bán Cho Thuê Bất Động Sản Uy Tín','Meta Title mặc định','seo','text'),
  ('meta_description',  'Kênh bất động sản uy tín tại Bình Dương.','Meta Description',     'seo',      'textarea'),
  ('meta_keywords',     'bất động sản bình dương, nhà đất bình dương','Meta Keywords',      'seo',      'text'),
  ('og_image',          '',                                         'OG Image URL',         'seo',      'url'),
  ('google_analytics_id','',                                        'Google Analytics ID',  'seo',      'text'),
  ('hero_title',        'Tìm Bất Động Sản Mơ Ước Tại Bình Dương', 'Tiêu đề Hero',         'hero',     'text'),
  ('hero_subtitle',     'Hàng nghìn BĐS được cập nhật mỗi ngày từ chủ nhà và nhà môi giới uy tín.','Mô tả Hero','hero','text'),
  ('hero_bg_image',     '',                                         'Ảnh nền Hero',         'hero',     'url'),
  ('section_featured_title', 'Bất Động Sản Nổi Bật',             'Tiêu đề khu nổi bật',  'sections', 'text'),
  ('section_regions_title',  'Khám Phá Theo Khu Vực',            'Tiêu đề khu vực',      'sections', 'text'),
  ('section_news_title',     'Tin Tức Thị Trường',               'Tiêu đề tin tức',      'sections', 'text')
ON CONFLICT (key) DO NOTHING;

-- Site Content (CMS)
INSERT INTO site_content (section, key, value, label, type, order_index) VALUES
  ('navbar', 'menu_home',     'Trang chủ',     'Menu: Trang chủ',     'text', 1),
  ('navbar', 'menu_buy',      'Mua bán',        'Menu: Mua bán',       'text', 2),
  ('navbar', 'menu_rent',     'Cho thuê',       'Menu: Cho thuê',      'text', 3),
  ('navbar', 'menu_projects', 'Dự án',          'Menu: Dự án',         'text', 4),
  ('navbar', 'menu_invest',   'Đầu tư',         'Menu: Đầu tư',        'text', 5),
  ('navbar', 'menu_news',     'Tin tức',        'Menu: Tin tức',       'text', 6),
  ('navbar', 'menu_about',    'Về chúng tôi',   'Menu: Về chúng tôi',  'text', 7),
  ('navbar', 'btn_login',     'Đăng nhập',      'Nút: Đăng nhập',      'text', 8),
  ('navbar', 'btn_post',      'Đăng tin',       'Nút: Đăng tin',       'text', 9),
  ('hero', 'title',           'Tìm kiếm bất động sản tại Bình Dương', 'Hero: Tiêu đề chính', 'text', 1),
  ('hero', 'subtitle',        'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín tại Bình Dương, Bình Phước, Đồng Nai', 'Hero: Mô tả phụ', 'text', 2),
  ('hero', 'search_placeholder', 'Tìm theo tên dự án, địa chỉ, khu vực...', 'Hero: Placeholder tìm kiếm', 'text', 3),
  ('hero', 'tab_buy',         'Mua bán',        'Hero: Tab Mua bán',   'text', 4),
  ('hero', 'tab_rent',        'Cho thuê',       'Hero: Tab Cho thuê',  'text', 5),
  ('hero', 'btn_search',      'Tìm kiếm',       'Hero: Nút tìm kiếm',  'text', 6),
  ('stats', 'stat1_number',   '5.000+',         'Thống kê 1: Con số',  'text', 1),
  ('stats', 'stat1_label',    'Tin đăng',       'Thống kê 1: Nhãn',    'text', 2),
  ('stats', 'stat2_number',   '10.000+',        'Thống kê 2: Con số',  'text', 3),
  ('stats', 'stat2_label',    'Khách hàng tin tưởng', 'Thống kê 2: Nhãn', 'text', 4),
  ('stats', 'stat3_number',   '7 năm',          'Thống kê 3: Con số',  'text', 5),
  ('stats', 'stat3_label',    'Kinh nghiệm',    'Thống kê 3: Nhãn',    'text', 6),
  ('stats', 'stat4_number',   '3',              'Thống kê 4: Con số',  'text', 7),
  ('stats', 'stat4_label',    'Tỉnh phủ sóng',  'Thống kê 4: Nhãn',    'text', 8),
  ('featured', 'title',       'Tin đăng nổi bật', 'Section nổi bật: Tiêu đề', 'text', 1),
  ('featured', 'subtitle',    'Các bất động sản được quan tâm nhiều nhất', 'Section nổi bật: Mô tả', 'text', 2),
  ('featured', 'btn_view_all','Xem tất cả',     'Section nổi bật: Nút', 'text', 3),
  ('hot', 'title',            'BĐS Hot - Giá tốt', 'Section Hot: Tiêu đề', 'text', 1),
  ('hot', 'subtitle',         'Cập nhật mới nhất, giá cạnh tranh', 'Section Hot: Mô tả', 'text', 2),
  ('whyus', 'title',          'Tại sao chọn chúng tôi?', 'Why us: Tiêu đề', 'text', 1),
  ('whyus', 'f1_title',       'Uy tín – Chuyên nghiệp', 'Why us: Tính năng 1', 'text', 2),
  ('whyus', 'f1_desc',        'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương', 'Why us: Mô tả 1', 'text', 3),
  ('whyus', 'f2_title',       'Thông tin minh bạch', 'Why us: Tính năng 2', 'text', 4),
  ('whyus', 'f2_desc',        'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng', 'Why us: Mô tả 2', 'text', 5),
  ('whyus', 'f3_title',       'Hỗ trợ 24/7', 'Why us: Tính năng 3', 'text', 6),
  ('whyus', 'f3_desc',        'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần', 'Why us: Mô tả 3', 'text', 7),
  ('whyus', 'f4_title',       'Pháp lý an toàn', 'Why us: Tính năng 4', 'text', 8),
  ('whyus', 'f4_desc',        'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z', 'Why us: Mô tả 4', 'text', 9),
  ('cta', 'title',            'Bạn có bất động sản cần bán hoặc cho thuê?', 'CTA: Tiêu đề', 'text', 1),
  ('cta', 'subtitle',         'Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng', 'CTA: Mô tả', 'text', 2),
  ('cta', 'btn_post',         'Đăng tin ngay', 'CTA: Nút đăng tin', 'text', 3),
  ('footer', 'copyright',     '© 2025 BĐS Bình Dương. Tất cả quyền được bảo lưu.', 'Footer: Bản quyền', 'text', 1),
  ('footer', 'col2_title',    'LIÊN KẾT NHANH', 'Footer: Cột 2 tiêu đề', 'text', 2),
  ('footer', 'col3_title',    'KHU VỰC', 'Footer: Cột 3 tiêu đề', 'text', 3),
  ('footer', 'col4_title',    'LIÊN HỆ', 'Footer: Cột 4 tiêu đề', 'text', 4)
ON CONFLICT (section, key) DO NOTHING;

-- Default Hero Banner
INSERT INTO banners (title, subtitle, cta_text, cta_link, image_url, position, order_index, is_active, bg_color)
VALUES (
  'Nhà đất Bình Dương – Giá tốt nhất thị trường',
  'Hàng nghìn lô đất, nhà phố, căn hộ đang chờ bạn',
  'Xem ngay', '/listings',
  'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg',
  'hero', 0, true, '#dc2626'
) ON CONFLICT DO NOTHING;

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

CREATE POLICY "um_select_own" ON user_media FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "um_insert_own" ON user_media FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "um_delete_own" ON user_media FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "um_select_admin" ON user_media FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "um_delete_admin" ON user_media FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================================================
-- HƯỚNG DẪN SETUP SAU KHI CHẠY SQL:
-- 1. Tạo Storage bucket tên "property-images" (public) trong Supabase Dashboard
-- 2. Vào Authentication > Settings: bật Email auth, tắt Email confirmation
-- 3. Tạo admin user: INSERT INTO profiles (id, role) VALUES ('<user-id>', 'admin')
--    sau khi đăng ký tài khoản admin qua trang /quantrihethong
-- 4. Deploy Edge Functions: ai-description, ai-analytics, ai-autotag, sitemap, crm-webhook
-- 5. Set secrets: ANTHROPIC_API_KEY hoặc OPENAI_API_KEY (tùy chọn – cho AI features)
-- =============================================================================
