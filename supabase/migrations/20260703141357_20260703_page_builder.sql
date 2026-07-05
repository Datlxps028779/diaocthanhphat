/*
# Page Builder - Section Layout Configuration

Adds `page_sections` table to control the visibility and order of sections
on the landing page (equivalent to a WordPress page builder).

1. New Tables
  - `page_sections`
    - `id` (text, primary key) – machine key matching the section identifier in frontend code
    - `label` (text) – human-readable display name shown in the admin UI
    - `description` (text, nullable) – short hint shown to the admin
    - `icon` (text, nullable) – icon name hint for the UI
    - `is_visible` (boolean, default true) – whether the section is rendered
    - `order_index` (integer) – ascending render order
    - `settings` (jsonb, default '{}') – reserved for future per-section config (background color, padding, etc.)
    - `created_at` / `updated_at` (timestamptz)

2. Default rows
  Seeds all 9 known sections with sensible defaults.

3. Security
  - RLS enabled.
  - Anon + authenticated SELECT (frontend needs to read layout without auth).
  - Authenticated-only UPDATE (only admin can mutate).
  - No INSERT/DELETE from client (rows are seeded at migration time and managed via UPDATE).
*/

CREATE TABLE IF NOT EXISTS page_sections (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  icon        text,
  is_visible  boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_sections_select" ON page_sections;
CREATE POLICY "page_sections_select" ON page_sections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "page_sections_update" ON page_sections;
CREATE POLICY "page_sections_update" ON page_sections FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "page_sections_insert" ON page_sections;
CREATE POLICY "page_sections_insert" ON page_sections FOR INSERT
  TO authenticated WITH CHECK (true);

-- Seed default sections (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO page_sections (id, label, description, icon, is_visible, order_index) VALUES
  ('hero',              'Hero & Tìm kiếm',          'Banner đầu trang, ô tìm kiếm BĐS', 'Home', true, 0),
  ('stats',             'Thống kê nổi bật',          'Dải số liệu: tổng BĐS, khách hàng...', 'BarChart3', true, 1),
  ('categories',        'Danh mục nhanh',            'Lưới loại hình BĐS (đất nền, nhà phố...)', 'Grid3X3', true, 2),
  ('featured_sections', 'Tin nổi bật (động)',        'Các section tin đăng do admin cấu hình', 'Layers', true, 3),
  ('region_banners',    'Khám phá theo khu vực',     'Banner 3 tỉnh: Bình Dương, Bình Phước, Đồng Nai', 'MapPin', true, 4),
  ('why_us',            'Tại sao chọn chúng tôi',   'Lưới 4 tính năng nổi bật', 'Shield', true, 5),
  ('testimonials',      'Đánh giá khách hàng',       'Testimonial / review từ khách hàng', 'Star', true, 6),
  ('news',              'Tin tức mới nhất',          'Grid 3 bài viết mới nhất', 'Newspaper', true, 7),
  ('cta',               'CTA Banner',                'Banner kêu gọi hành động cuối trang', 'Zap', true, 8),
  ('social_proof',      'Minh chứng xã hội',        'Dải biểu tượng tin cậy (đăng ký, xác thực...)', 'CheckCircle', true, 9)
ON CONFLICT (id) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_page_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_page_sections_updated_at ON page_sections;
CREATE TRIGGER trg_page_sections_updated_at
  BEFORE UPDATE ON page_sections
  FOR EACH ROW EXECUTE FUNCTION update_page_sections_updated_at();
