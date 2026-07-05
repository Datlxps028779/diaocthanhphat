-- =============================================================================
-- Auto Slug Function - Tự động tạo slug từ tiêu đề
-- =============================================================================

-- Tạo extension để tạo slug tự động
-- Sử dụng trong trigger hoặc gọi trực tiếp từ API

CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
DECLARE
  slug text;
  base_slug text;
BEGIN
  -- Chuyển thành chữ thường, bỏ dấu, thay khoảng trắng bằng dấu gạch ngang
  base_slug := regexp_replace(
    lower(
      title,
      'N'
    ),
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
  
  -- Thay các ký tự đặc biệt và khoảng trắng thành gạch ngang
  slug := regexp_replace(
    regexp_replace(
      base_slug,
      '[^a-z0-9\s-]', '', 'g'
    ),
    '\s+', '-', 'g'
  );
  
  -- Loại bỏ các gạch ngang ở đầu và cuối
  slug := trim(both '-' from slug);
  
  -- Giới hạn độ dài slug
  slug := substring(slug, 1, 100);
  
  RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Thêm cột slug cho bảng properties (nếu chưa có)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Thêm index cho slug
CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);

-- Trigger tự động tạo slug khi tạo Property mới
CREATE OR REPLACE FUNCTION set_property_slug()
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

DROP TRIGGER IF EXISTS trg_properties_slug ON properties;
CREATE TRIGGER trg_properties_slug
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION set_property_slug();

-- Thêm cột slug cho bảng news (nếu chưa có)
ALTER TABLE news ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Thêm index cho slug
CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);

-- Trigger tự động tạo slug khi tạo News mới
CREATE OR REPLACE FUNCTION set_news_slug()
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

DROP TRIGGER IF EXISTS trg_news_slug ON news;
CREATE TRIGGER trg_news_slug
  BEFORE INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION set_news_slug();