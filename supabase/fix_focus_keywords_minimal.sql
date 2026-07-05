-- =============================================================================
-- FIX TỐI GIẢN: Lỗi PGRST204 - focus_keywords column missing
-- Chỉ thêm cột + reload schema, không phụ thuộc function nào khác
-- =============================================================================
-- Copy toàn bộ nội dung này, dán vào Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- Bước 1: Thêm cột focus_keywords cho properties (QUAN TRỌNG NHẤT)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords text;

-- Bước 2: Thêm cột schema_markup cho properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- Bước 3: Thêm các cột SEO còn thiếu cho user_listings
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- Bước 4: Reload PostgREST schema cache (BẮT BUỘC)
NOTIFY pgrst, 'reload schema';

-- Bước 5: Kiểm tra cột đã tồn tại chưa
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'properties' 
  AND column_name IN ('focus_keywords', 'schema_markup')
ORDER BY column_name;