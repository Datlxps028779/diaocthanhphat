-- =============================================================================
-- SEO Fields: Thêm trường SEO chuẩn cho properties và user_listings
-- - focus_keywords: từ khóa chính (text)
-- - schema_markup: JSON-LD cho RealEstateListing (jsonb)
-- - meta_title: đã có trên properties, thêm cho user_listings
-- - meta_description: đã có trên properties, thêm cho user_listings
-- =============================================================================

-- ─── properties: thêm focus_keywords + schema_markup ──────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- ─── user_listings: thêm đầy đủ trường SEO ────────────────────────────────────
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- Index cho slug trên user_listings
CREATE INDEX IF NOT EXISTS idx_user_listings_slug ON user_listings(slug);

-- ─── Trigger tự động tạo slug cho user_listings ──────────────────────────────
CREATE OR REPLACE FUNCTION set_user_listing_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    -- Đảm bảo slug duy nhất
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_listings_slug ON user_listings;
CREATE TRIGGER trg_user_listings_slug
  BEFORE INSERT ON user_listings
  FOR EACH ROW EXECUTE FUNCTION set_user_listing_slug();

-- ─── Trigger tự động fill meta_title/meta_description nếu trống ───────────────
-- properties
CREATE OR REPLACE FUNCTION autofill_property_seo()
RETURNS trigger AS $$
BEGIN
  -- Nếu meta_title trống → dùng title (giới hạn 60 ký tự)
  IF NEW.meta_title IS NULL OR NEW.meta_title = '' THEN
    NEW.meta_title := substring(NEW.title, 1, 60);
  END IF;
  -- Nếu meta_description trống → dùng 155 ký tự đầu của description
  IF (NEW.meta_description IS NULL OR NEW.meta_description = '') AND NEW.description IS NOT NULL THEN
    NEW.meta_description := substring(NEW.description, 1, 155);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_autofill_seo ON properties;
CREATE TRIGGER trg_properties_autofill_seo
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION autofill_property_seo();

-- user_listings
CREATE OR REPLACE FUNCTION autofill_user_listing_seo()
RETURNS trigger AS $$
BEGIN
  IF NEW.meta_title IS NULL OR NEW.meta_title = '' THEN
    NEW.meta_title := substring(NEW.title, 1, 60);
  END IF;
  IF (NEW.meta_description IS NULL OR NEW.meta_description = '') AND NEW.description IS NOT NULL THEN
    NEW.meta_description := substring(NEW.description, 1, 155);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_listings_autofill_seo ON user_listings;
CREATE TRIGGER trg_user_listings_autofill_seo
  BEFORE INSERT OR UPDATE ON user_listings
  FOR EACH ROW EXECUTE FUNCTION autofill_user_listing_seo();

-- ─── RLS: cho phép user đọc/ghi SEO fields của listing thuộc về mình ──────────
-- (RLS đã có trên user_listings, chỉ cần đảm bảo policy cover các cột mới)
-- Không cần thêm policy vì policy hiện tại đã cover toàn bộ row-level.