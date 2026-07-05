-- Districts taxonomy table (Province → District hierarchy)
CREATE TABLE IF NOT EXISTS districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid REFERENCES areas(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS districts_slug_idx ON districts(slug);
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "districts_select_public" ON districts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Add district_id FK to properties and user_listings for structured taxonomy
ALTER TABLE properties ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);

-- Add clicks/impressions tracking to banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS clicks integer DEFAULT 0;

-- Seed districts for Bình Dương
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Thủ Dầu Một', 'thu-dau-mot', 1),
  ('Dĩ An', 'di-an', 2),
  ('Thuận An', 'thuan-an', 3),
  ('Bến Cát', 'ben-cat', 4),
  ('Bàu Bàng', 'bau-bang', 5),
  ('Tân Uyên', 'tan-uyen', 6),
  ('Bình Dương (Phú Giáo)', 'phu-giao', 7),
  ('Dầu Tiếng', 'dau-tieng', 8)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Dương%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Bình Phước
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Đồng Xoài', 'dong-xoai', 1),
  ('Bình Long', 'binh-long', 2),
  ('Phước Long', 'phuoc-long', 3),
  ('Chơn Thành', 'chon-thanh', 4),
  ('Đồng Phú', 'dong-phu', 5),
  ('Bù Đăng', 'bu-dang', 6),
  ('Hớn Quản', 'hon-quan', 7),
  ('Lộc Ninh', 'loc-ninh', 8),
  ('Bù Gia Mập', 'bu-gia-map', 9),
  ('Bù Đốp', 'bu-dop', 10)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Phước%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Đồng Nai
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Biên Hòa', 'bien-hoa', 1),
  ('Long Khánh', 'long-khanh', 2),
  ('Nhơn Trạch', 'nhon-trach', 3),
  ('Long Thành', 'long-thanh', 4),
  ('Trảng Bom', 'trang-bom', 5),
  ('Xuân Lộc', 'xuan-loc', 6),
  ('Thống Nhất', 'thong-nhat', 7),
  ('Định Quán', 'dinh-quan', 8),
  ('Tân Phú', 'tan-phu-dong-nai', 9),
  ('Vĩnh Cửu', 'vinh-cuu', 10),
  ('Cẩm Mỹ', 'cam-my', 11)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Đồng Nai%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Hồ Chí Minh (if it exists in areas)
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Quận 1', 'quan-1-hcm', 1),
  ('Quận 2 (Thủ Đức)', 'quan-2-thu-duc', 2),
  ('Quận 7', 'quan-7-hcm', 3),
  ('Bình Thạnh', 'binh-thanh-hcm', 4),
  ('Gò Vấp', 'go-vap-hcm', 5),
  ('Tân Bình', 'tan-binh-hcm', 6),
  ('Nhà Bè', 'nha-be-hcm', 7),
  ('Hóc Môn', 'hoc-mon-hcm', 8),
  ('Bình Chánh', 'binh-chanh-hcm', 9),
  ('Củ Chi', 'cu-chi-hcm', 10)
) AS d(name, slug, ord) ON true
WHERE (a.name ILIKE '%Hồ Chí Minh%' OR a.name ILIKE '%TP HCM%' OR a.name ILIKE '%TP.HCM%')
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;
