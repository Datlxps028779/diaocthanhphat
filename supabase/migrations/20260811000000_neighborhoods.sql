-- =============================================================================
-- Khu dân cư (neighborhoods) — cấp 4 dưới wards, làm Entity Page pillar SEO/GEO/AIO
-- =============================================================================
-- Phân cấp vị trí: areas (Tỉnh) → districts (Quận/Huyện) → wards (Phường/Xã)
--   → neighborhoods (Khu dân cư, vd "KDC Phú Hồng Thịnh 8").
-- Bám khuôn wards: bảng nguồn cho dropdown cascade + cột text 'neighborhood_slug'
-- trên properties để lưu/lọc (nhất quán với district/ward đang là text).
-- Khác wards: thêm 4 cột SEO (giống areas) để Entity Page có meta/schema riêng
-- + description/image_url cho nội dung pillar.
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid REFERENCES wards(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  image_url text,
  order_index integer DEFAULT 0,
  meta_title text,
  meta_description text,
  focus_keywords text,
  schema_markup jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS neighborhoods_slug_idx ON neighborhoods(slug);
CREATE INDEX IF NOT EXISTS neighborhoods_ward_idx ON neighborhoods(ward_id);

ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neighborhoods_select_public" ON neighborhoods;
CREATE POLICY "neighborhoods_select_public" ON neighborhoods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "neighborhoods_insert_admin" ON neighborhoods;
CREATE POLICY "neighborhoods_insert_admin" ON neighborhoods FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "neighborhoods_update_admin" ON neighborhoods;
CREATE POLICY "neighborhoods_update_admin" ON neighborhoods FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "neighborhoods_delete_admin" ON neighborhoods;
CREATE POLICY "neighborhoods_delete_admin" ON neighborhoods FOR DELETE TO authenticated USING (is_admin());

-- Cột text để listing gán khu dân cư + bộ lọc/aggregation khớp theo slug.
ALTER TABLE properties    ADD COLUMN IF NOT EXISTS neighborhood_slug text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS neighborhood_slug text;
CREATE INDEX IF NOT EXISTS properties_neighborhood_idx ON properties(neighborhood_slug);

NOTIFY pgrst, 'reload schema';
