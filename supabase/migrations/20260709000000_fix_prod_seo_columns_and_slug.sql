-- =============================================================================
-- FIX PRODUCTION: đủ cột SEO cho properties/news + auto-slug + backfill slug cũ
-- =============================================================================
-- Chạy MỘT LẦN trên Supabase production (SQL Editor). An toàn chạy lại nhiều lần
-- (idempotent). Sửa 2 lỗi:
--   1) "Could not find the 'focus_keywords' column ... [PGRST204]" khi lưu BĐS
--      → thiếu cột SEO trên bảng properties ở production.
--   2) URL /bat-dong-san/<UUID> thay vì /bat-dong-san/<slug> chuẩn SEO
--      → bản ghi cũ chưa có slug → code fallback về id (UUID).
-- =============================================================================

-- ─── 1) properties: thêm ĐỦ cột SEO code đang ghi ────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug             text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords   text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup    jsonb;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_title       text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_description text;

-- ─── 2) news: đảm bảo có slug (URL /tin-tuc/{slug}) ──────────────────────────
ALTER TABLE news ADD COLUMN IF NOT EXISTS slug text;

-- ─── 3) generate_slug: bỏ dấu tiếng Việt bằng translate, tối đa 80 ký tự ──────
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

-- ─── 4) Trigger tự sinh slug khi INSERT (chỉ khi slug rỗng) ───────────────────
-- Đúng yêu cầu: chỉ admin nhập tay slug mới được giữ; còn lại luôn auto.
CREATE OR REPLACE FUNCTION set_property_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_slug ON properties;
CREATE TRIGGER trg_properties_slug
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION set_property_slug();

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

-- ─── 5) Backfill slug cho bản ghi CŨ còn NULL/rỗng ───────────────────────────
-- Đây là bước sửa URL /bat-dong-san/<UUID> → <slug>. Hậu tố ngắn chống trùng.
UPDATE properties
SET slug = generate_slug(title) || '-' || substring(gen_random_uuid()::text, 1, 4)
WHERE slug IS NULL OR slug = '';

UPDATE news
SET slug = generate_slug(title) || '-' || substring(gen_random_uuid()::text, 1, 6)
WHERE slug IS NULL OR slug = '';

-- ─── 6) UNIQUE index tạo SAU backfill (tránh vỡ ràng buộc khi đang điền) ──────
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_slug       ON news(slug);

-- ─── 7) Nạp lại schema cache của PostgREST (hết lỗi PGRST204 ngay) ────────────
NOTIFY pgrst, 'reload schema';
