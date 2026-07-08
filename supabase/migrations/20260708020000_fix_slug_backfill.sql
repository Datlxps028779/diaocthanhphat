-- =============================================================================
-- Thêm cột SEO còn thiếu + fix generate_slug + backfill slug (properties & news)
-- =============================================================================
-- Trên production, các migration cũ (auto_slug, seo_fields) CHƯA chạy nên bảng
-- properties thiếu hẳn cột slug / focus_keywords / schema_markup → URL sản phẩm
-- không có slug, và lưu tin từ admin bị lỗi "column does not exist".
-- Migration này TỰ CHỨA: thêm cột (idempotent), viết lại generate_slug cho đúng,
-- và backfill slug cho bản ghi cũ. Chạy được độc lập dù migration trước có chạy hay không.

-- ─── properties: thêm cột SEO ────────────────────────────────────────────────
-- slug KHÔNG UNIQUE: URL dạng /bat-dong-san/{slug}-{id}, id đã đảm bảo duy nhất,
-- nên admin được tự do đặt slug trùng mà không vỡ ràng buộc.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup jsonb;
CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);

-- news: đảm bảo có slug (URL /tin-tuc/{slug} nên giữ UNIQUE)
ALTER TABLE news ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_slug ON news(slug);

-- ─── generate_slug: viết lại cho đúng (bỏ dấu tiếng Việt bằng translate) ──────
CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(title, ''));
  s := translate(s,
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  s := regexp_replace(s, '[^a-z0-9\s-]', '', 'g');
  s := regexp_replace(s, '\s+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  s := substring(s, 1, 80);
  IF s = '' THEN s := 'bat-dong-san'; END IF;
  RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── Trigger insert: set slug khi rỗng ───────────────────────────────────────
-- properties: KHÔNG cần hậu tố (id trong URL đảm bảo duy nhất)
CREATE OR REPLACE FUNCTION set_property_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_slug ON properties;
CREATE TRIGGER trg_properties_slug
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION set_property_slug();

-- news: slug phải duy nhất → thêm hậu tố ngắn
CREATE OR REPLACE FUNCTION set_news_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_news_slug ON news;
CREATE TRIGGER trg_news_slug
  BEFORE INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION set_news_slug();

-- ─── Backfill bản ghi cũ còn NULL/rỗng slug ──────────────────────────────────
UPDATE properties
SET slug = generate_slug(title)
WHERE slug IS NULL OR slug = '';

UPDATE news
SET slug = generate_slug(title) || '-' || substring(gen_random_uuid()::text, 1, 6)
WHERE slug IS NULL OR slug = '';
