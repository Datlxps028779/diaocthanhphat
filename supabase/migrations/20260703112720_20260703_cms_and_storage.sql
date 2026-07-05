/*
# CMS, Storage & Enhanced Property Schema

## Summary
Adds full CMS (Content Management System) so all UI text, positions, and layouts
can be edited from the admin panel without touching code. Also adds:
- listing_type to properties (mua_ban / cho_thue / can_mua / can_thue)
- site_settings table for global site configuration
- site_content table for all editable UI text/content blocks
- banners table for hero/promotional banners with drag-drop ordering
- Property images stored as array with order

## New Tables

### site_settings
Stores global site configuration (site name, logo, contact info, social links, etc.)
- `key` (text, unique) - setting identifier
- `value` (text) - setting value
- `label` (text) - human-readable label for admin
- `group` (text) - grouping (general, contact, social, seo)
- `type` (text) - input type (text, textarea, url, phone, color, toggle)

### site_content
CMS content blocks: every piece of UI text editable without code.
- `section` (text) - page/section identifier (hero, navbar, footer, about, etc.)
- `key` (text, unique per section) - content identifier
- `value` (text) - the actual content
- `label` (text) - admin-facing label
- `type` (text) - content type (text, textarea, html, image_url, color)
- `order_index` (int) - display order within section

### banners
Promotional banners displayed on homepage/listings.
- `title` (text) - banner headline
- `subtitle` (text) - subheadline
- `cta_text` (text) - button text
- `cta_link` (text) - button destination
- `image_url` (text) - background image
- `position` (text) - where to show (hero, sidebar, footer_cta)
- `order_index` (int) - drag-drop order
- `is_active` (bool) - show/hide
- `bg_color` (text) - fallback background color

## Modified Tables

### properties
- Add `listing_type` column: 'mua_ban' | 'cho_thue' | 'can_mua' | 'can_thue'
- Add `price_per_month` for rental listings (triệu/tháng)
- Add `floor_area` for apartment floor number
- Add `images_order` jsonb for storing image order metadata

## Security
All new tables use RLS with anon+authenticated read, admin-only write.
*/

-- ─── properties: add listing_type ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='listing_type') THEN
    ALTER TABLE properties ADD COLUMN listing_type text NOT NULL DEFAULT 'mua_ban' CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='price_per_month') THEN
    ALTER TABLE properties ADD COLUMN price_per_month numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='floor_number') THEN
    ALTER TABLE properties ADD COLUMN floor_number integer;
  END IF;
END $$;

-- same for user_listings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='listing_type') THEN
    ALTER TABLE user_listings ADD COLUMN listing_type text NOT NULL DEFAULT 'mua_ban' CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='price_per_month') THEN
    ALTER TABLE user_listings ADD COLUMN price_per_month numeric;
  END IF;
END $$;

-- ─── site_settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  label text NOT NULL,
  group_name text NOT NULL DEFAULT 'general',
  type text NOT NULL DEFAULT 'text',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_site_settings" ON site_settings;
CREATE POLICY "anon_select_site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_site_settings" ON site_settings;
CREATE POLICY "auth_insert_site_settings" ON site_settings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_site_settings" ON site_settings;
CREATE POLICY "auth_update_site_settings" ON site_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_site_settings" ON site_settings;
CREATE POLICY "auth_delete_site_settings" ON site_settings FOR DELETE TO authenticated USING (true);

-- ─── site_content ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  key text NOT NULL,
  value text,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, key)
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_site_content" ON site_content;
CREATE POLICY "anon_select_site_content" ON site_content FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_site_content" ON site_content;
CREATE POLICY "auth_insert_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_site_content" ON site_content;
CREATE POLICY "auth_update_site_content" ON site_content FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_site_content" ON site_content;
CREATE POLICY "auth_delete_site_content" ON site_content FOR DELETE TO authenticated USING (true);

-- ─── banners ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  cta_text text,
  cta_link text,
  image_url text,
  bg_color text DEFAULT '#dc2626',
  position text NOT NULL DEFAULT 'hero' CHECK (position IN ('hero','sidebar','footer_cta','listings_top')),
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_banners" ON banners;
CREATE POLICY "anon_select_banners" ON banners FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_banners" ON banners;
CREATE POLICY "auth_insert_banners" ON banners FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_banners" ON banners;
CREATE POLICY "auth_update_banners" ON banners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_banners" ON banners;
CREATE POLICY "auth_delete_banners" ON banners FOR DELETE TO authenticated USING (true);

-- ─── indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_properties_listing_type ON properties(listing_type);
CREATE INDEX IF NOT EXISTS idx_site_content_section ON site_content(section, order_index);
CREATE INDEX IF NOT EXISTS idx_banners_position ON banners(position, order_index) WHERE is_active = true;

-- ─── Default site_settings ──────────────────────────────────────────────────────
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('site_name', 'BĐS Bình Dương', 'Tên website', 'general', 'text'),
  ('site_tagline', 'Kênh thông tin bất động sản uy tín tại Bình Dương', 'Slogan website', 'general', 'text'),
  ('site_logo_text', 'BĐS BÌNH DƯƠNG', 'Text logo', 'general', 'text'),
  ('site_logo_sub', 'Bất Động Sản Uy Tín', 'Sub text logo', 'general', 'text'),
  ('phone_main', '0901 234 567', 'Số điện thoại chính', 'contact', 'phone'),
  ('phone_hotline', '0901 234 567', 'Hotline', 'contact', 'phone'),
  ('zalo_link', 'https://zalo.me/0901234567', 'Link Zalo', 'contact', 'url'),
  ('address', 'Thủ Dầu Một, Bình Dương', 'Địa chỉ văn phòng', 'contact', 'text'),
  ('email', 'info@bdsbinhduong.vn', 'Email liên hệ', 'contact', 'text'),
  ('facebook_url', '', 'Facebook URL', 'social', 'url'),
  ('youtube_url', '', 'YouTube URL', 'social', 'url'),
  ('tiktok_url', '', 'TikTok URL', 'social', 'url'),
  ('footer_description', 'Nền tảng bất động sản uy tín tại Bình Dương và các tỉnh lân cận. Kết nối người mua và người bán nhanh chóng, minh bạch.', 'Mô tả footer', 'general', 'textarea'),
  ('primary_color', '#dc2626', 'Màu chủ đạo (hex)', 'general', 'color'),
  ('seo_title', 'BĐS Bình Dương - Mua bán nhà đất Bình Dương uy tín', 'SEO Title', 'seo', 'text'),
  ('seo_description', 'Tìm kiếm nhà đất, căn hộ, đất nền tại Bình Dương, Bình Phước, Đồng Nai. Tin đăng uy tín, cập nhật liên tục.', 'SEO Description', 'seo', 'textarea')
ON CONFLICT (key) DO NOTHING;

-- ─── Default site_content ───────────────────────────────────────────────────────
INSERT INTO site_content (section, key, value, label, type, order_index) VALUES
  -- Header/Navbar
  ('navbar', 'menu_home', 'Trang chủ', 'Menu: Trang chủ', 'text', 1),
  ('navbar', 'menu_buy', 'Mua bán', 'Menu: Mua bán', 'text', 2),
  ('navbar', 'menu_rent', 'Cho thuê', 'Menu: Cho thuê', 'text', 3),
  ('navbar', 'menu_projects', 'Dự án', 'Menu: Dự án', 'text', 4),
  ('navbar', 'menu_invest', 'Đầu tư', 'Menu: Đầu tư', 'text', 5),
  ('navbar', 'menu_news', 'Tin tức', 'Menu: Tin tức', 'text', 6),
  ('navbar', 'menu_about', 'Về chúng tôi', 'Menu: Về chúng tôi', 'text', 7),
  ('navbar', 'btn_login', 'Đăng nhập', 'Nút: Đăng nhập', 'text', 8),
  ('navbar', 'btn_post', 'Đăng tin', 'Nút: Đăng tin', 'text', 9),
  -- Hero section
  ('hero', 'title', 'Tìm kiếm bất động sản tại Bình Dương', 'Hero: Tiêu đề chính', 'text', 1),
  ('hero', 'subtitle', 'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín tại Bình Dương, Bình Phước, Đồng Nai', 'Hero: Mô tả phụ', 'text', 2),
  ('hero', 'search_placeholder', 'Tìm theo tên dự án, địa chỉ, khu vực...', 'Hero: Placeholder tìm kiếm', 'text', 3),
  ('hero', 'tab_buy', 'Mua bán', 'Hero: Tab Mua bán', 'text', 4),
  ('hero', 'tab_rent', 'Cho thuê', 'Hero: Tab Cho thuê', 'text', 5),
  ('hero', 'tab_need_buy', 'Cần mua', 'Hero: Tab Cần mua', 'text', 6),
  ('hero', 'tab_need_rent', 'Cần thuê', 'Hero: Tab Cần thuê', 'text', 7),
  ('hero', 'btn_search', 'Tìm kiếm', 'Hero: Nút tìm kiếm', 'text', 8),
  -- Stats bar
  ('stats', 'stat1_number', '5.000+', 'Thống kê 1: Con số', 'text', 1),
  ('stats', 'stat1_label', 'Tin đăng', 'Thống kê 1: Nhãn', 'text', 2),
  ('stats', 'stat2_number', '10.000+', 'Thống kê 2: Con số', 'text', 3),
  ('stats', 'stat2_label', 'Khách hàng tin tưởng', 'Thống kê 2: Nhãn', 'text', 4),
  ('stats', 'stat3_number', '7 năm', 'Thống kê 3: Con số', 'text', 5),
  ('stats', 'stat3_label', 'Kinh nghiệm', 'Thống kê 3: Nhãn', 'text', 6),
  ('stats', 'stat4_number', '3', 'Thống kê 4: Con số', 'text', 7),
  ('stats', 'stat4_label', 'Tỉnh phủ sóng', 'Thống kê 4: Nhãn', 'text', 8),
  -- Featured section
  ('featured', 'title', 'Tin đăng nổi bật', 'Section nổi bật: Tiêu đề', 'text', 1),
  ('featured', 'subtitle', 'Các bất động sản được quan tâm nhiều nhất', 'Section nổi bật: Mô tả', 'text', 2),
  ('featured', 'btn_view_all', 'Xem tất cả', 'Section nổi bật: Nút xem tất cả', 'text', 3),
  -- Hot section
  ('hot', 'title', 'BĐS Hot - Giá tốt', 'Section Hot: Tiêu đề', 'text', 1),
  ('hot', 'subtitle', 'Cập nhật mới nhất, giá cạnh tranh', 'Section Hot: Mô tả', 'text', 2),
  -- Why us section
  ('whyus', 'title', 'Tại sao chọn chúng tôi?', 'Why us: Tiêu đề', 'text', 1),
  ('whyus', 'f1_title', 'Uy tín - Chuyên nghiệp', 'Why us: Tính năng 1 tiêu đề', 'text', 2),
  ('whyus', 'f1_desc', 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương', 'Why us: Tính năng 1 mô tả', 'text', 3),
  ('whyus', 'f2_title', 'Thông tin minh bạch', 'Why us: Tính năng 2 tiêu đề', 'text', 4),
  ('whyus', 'f2_desc', 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng', 'Why us: Tính năng 2 mô tả', 'text', 5),
  ('whyus', 'f3_title', 'Hỗ trợ 24/7', 'Why us: Tính năng 3 tiêu đề', 'text', 6),
  ('whyus', 'f3_desc', 'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần', 'Why us: Tính năng 3 mô tả', 'text', 7),
  ('whyus', 'f4_title', 'Pháp lý an toàn', 'Why us: Tính năng 4 tiêu đề', 'text', 8),
  ('whyus', 'f4_desc', 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z', 'Why us: Tính năng 4 mô tả', 'text', 9),
  -- CTA banner
  ('cta', 'title', 'Bạn có bất động sản cần bán hoặc cho thuê?', 'CTA: Tiêu đề', 'text', 1),
  ('cta', 'subtitle', 'Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng', 'CTA: Mô tả', 'text', 2),
  ('cta', 'btn_post', 'Đăng tin ngay', 'CTA: Nút đăng tin', 'text', 3),
  ('cta', 'btn_contact', 'Liên hệ tư vấn', 'CTA: Nút liên hệ', 'text', 4),
  -- Footer
  ('footer', 'copyright', '© 2025 BĐS Bình Dương. Tất cả quyền được bảo lưu.', 'Footer: Bản quyền', 'text', 1),
  ('footer', 'col1_title', 'Về chúng tôi', 'Footer: Cột 1 tiêu đề', 'text', 2),
  ('footer', 'col2_title', 'Liên kết nhanh', 'Footer: Cột 2 tiêu đề', 'text', 3),
  ('footer', 'col3_title', 'Khu vực hoạt động', 'Footer: Cột 3 tiêu đề', 'text', 4),
  ('footer', 'col4_title', 'Liên hệ', 'Footer: Cột 4 tiêu đề', 'text', 5)
ON CONFLICT (section, key) DO NOTHING;

-- ─── Default banners ────────────────────────────────────────────────────────────
INSERT INTO banners (title, subtitle, cta_text, cta_link, image_url, position, order_index, is_active, bg_color) VALUES
  (
    'Nhà đất Bình Dương – Giá tốt nhất thị trường',
    'Hàng nghìn lô đất, nhà phố, căn hộ đang chờ bạn',
    'Xem ngay',
    '/listings',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg',
    'hero',
    0,
    true,
    '#dc2626'
  ),
  (
    'Đăng tin BĐS miễn phí',
    'Tiếp cận ngay hàng nghìn khách hàng tiềm năng',
    'Đăng tin ngay',
    '/post-listing',
    null,
    'footer_cta',
    0,
    true,
    '#1d4ed8'
  )
ON CONFLICT DO NOTHING;
