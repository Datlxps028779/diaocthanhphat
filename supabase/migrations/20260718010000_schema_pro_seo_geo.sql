-- Schema Pro / SEO-GEO foundation
-- Additive and idempotent: extends SEO fields, route overrides, and site entity settings.

ALTER TABLE news ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE news ADD COLUMN IF NOT EXISTS schema_markup jsonb;

ALTER TABLE areas ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS schema_markup jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_schema_markup_object') THEN
    ALTER TABLE news ADD CONSTRAINT news_schema_markup_object
      CHECK (schema_markup IS NULL OR jsonb_typeof(schema_markup) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_schema_markup_object') THEN
    ALTER TABLE areas ADD CONSTRAINT areas_schema_markup_object
      CHECK (schema_markup IS NULL OR jsonb_typeof(schema_markup) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_schema_markup_object') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_schema_markup_object
      CHECK (schema_markup IS NULL OR jsonb_typeof(schema_markup) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_listings_schema_markup_object') THEN
    ALTER TABLE user_listings ADD CONSTRAINT user_listings_schema_markup_object
      CHECK (schema_markup IS NULL OR jsonb_typeof(schema_markup) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS seo_route_overrides (
  path text PRIMARY KEY,
  meta_title text,
  meta_description text,
  focus_keywords text,
  canonical_path text,
  robots_index boolean,
  robots_follow boolean DEFAULT true,
  schema_markup jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT seo_route_overrides_path_abs CHECK (path ~ '^/'),
  CONSTRAINT seo_route_overrides_canonical_abs CHECK (canonical_path IS NULL OR canonical_path ~ '^/'),
  CONSTRAINT seo_route_overrides_schema_object CHECK (schema_markup IS NULL OR jsonb_typeof(schema_markup) = 'object')
);

ALTER TABLE seo_route_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seo_route_overrides_select" ON seo_route_overrides;
CREATE POLICY "seo_route_overrides_select" ON seo_route_overrides
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "seo_route_overrides_insert_admin" ON seo_route_overrides;
CREATE POLICY "seo_route_overrides_insert_admin" ON seo_route_overrides
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "seo_route_overrides_update_admin" ON seo_route_overrides;
CREATE POLICY "seo_route_overrides_update_admin" ON seo_route_overrides
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "seo_route_overrides_delete_admin" ON seo_route_overrides;
CREATE POLICY "seo_route_overrides_delete_admin" ON seo_route_overrides
  FOR DELETE TO authenticated USING (is_admin());

DROP TRIGGER IF EXISTS seo_route_overrides_updated_at ON seo_route_overrides;
CREATE TRIGGER seo_route_overrides_updated_at
  BEFORE UPDATE ON seo_route_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('organization_legal_name', '', 'Tên pháp lý doanh nghiệp', 'schema', 'text'),
  ('organization_description', '', 'Mô tả Schema Organization', 'schema', 'textarea'),
  ('geo_area_served', 'Bình Dương, Việt Nam', 'Khu vực phục vụ', 'schema', 'text'),
  ('knows_about', 'bất động sản Bình Dương, đất nền, nhà phố, cho thuê bất động sản', 'Chủ đề chuyên môn', 'schema', 'textarea'),
  ('organization_license', '', 'Giấy phép/chứng nhận thật (nếu có)', 'schema', 'text')
ON CONFLICT (key) DO NOTHING;

INSERT INTO seo_route_overrides (path, robots_index, robots_follow) VALUES
  ('/', true, true),
  ('/danh-sach', true, true),
  ('/mua-ban', true, true),
  ('/cho-thue', true, true),
  ('/khu-vuc', true, true),
  ('/tin-tuc', true, true),
  ('/ve-chung-toi', true, true)
ON CONFLICT (path) DO NOTHING;

NOTIFY pgrst, 'reload schema';
