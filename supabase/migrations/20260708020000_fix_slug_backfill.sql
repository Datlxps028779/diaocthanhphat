-- =============================================================================
-- Fix generate_slug + backfill slug cho properties & news
-- =============================================================================
-- Hàm generate_slug cũ (migration 20260704200000) bị lỗi: gọi lower(title,'N')
-- sai cú pháp và nối 6 bản sao title, nên slug sinh ra rác hoặc trigger fail →
-- nhiều tin cũ có slug NULL → URL /bat-dong-san/{slug} không hiển thị/chia sẻ được.
-- Migration này viết lại hàm cho đúng và backfill toàn bộ bản ghi còn thiếu slug.

CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(title, ''));
  -- Bỏ dấu tiếng Việt
  s := translate(s,
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  -- Chỉ giữ a-z, 0-9, khoảng trắng, gạch ngang
  s := regexp_replace(s, '[^a-z0-9\s-]', '', 'g');
  -- Khoảng trắng → gạch ngang, gộp gạch liên tiếp, trim
  s := regexp_replace(s, '\s+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  s := substring(s, 1, 80);
  IF s = '' THEN s := 'bat-dong-san'; END IF;
  RETURN s;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger insert: chỉ set khi slug rỗng, thêm hậu tố ngắn để đảm bảo UNIQUE
CREATE OR REPLACE FUNCTION set_property_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_news_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title) || '-' || substring(gen_random_uuid()::text, 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill các bản ghi cũ còn NULL/rỗng slug
UPDATE properties
SET slug = generate_slug(title) || '-' || substring(gen_random_uuid()::text, 1, 6)
WHERE slug IS NULL OR slug = '';

UPDATE news
SET slug = generate_slug(title) || '-' || substring(gen_random_uuid()::text, 1, 6)
WHERE slug IS NULL OR slug = '';
