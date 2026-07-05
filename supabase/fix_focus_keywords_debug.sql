-- =============================================================================
-- DEBUG + FIX: Kiểm tra và thêm cột focus_keywords cho properties
-- =============================================================================
-- Copy toàn bộ file này, dán vào Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- BƯỚC 1: Kiểm tra cột focus_keywords có tồn tại chưa
SELECT 'BƯỚC 1: Kiểm tra cột focus_keywords' as step;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'properties' 
  AND column_name = 'focus_keywords';

-- BƯỚC 2: Thêm cột nếu chưa có (sẽ không lỗi nếu đã có)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords text;

-- BƯỚC 3: Thêm schema_markup nếu chưa có
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- BƯỚC 4: Thêm cột SEO cho user_listings
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- BƯỚC 5: Kiểm tra lại sau khi thêm
SELECT 'BƯỚC 5: Kiểm tra lại sau khi thêm' as step;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'properties' 
  AND column_name IN ('focus_keywords', 'schema_markup')
ORDER BY column_name;

-- BƯỚC 6: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- BƯỚC 7: Đợi 5 giây rồi kiểm tra (chạy riêng sau khi reload)
-- SELECT 'BƯỚC 7: Test query' as step;
-- SELECT id, focus_keywords FROM properties LIMIT 1;