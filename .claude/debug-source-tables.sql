-- Kiểm tra property_types table
SELECT id, name, slug FROM property_types ORDER BY name;

-- Kiểm tra news_categories table
SELECT id, slug FROM news_categories ORDER BY slug;

-- Debug: Xem có property nào dùng property_type_id không
SELECT DISTINCT property_type_id, COUNT(*) as count
FROM properties
WHERE property_type_id IS NOT NULL AND is_active = true
GROUP BY property_type_id
ORDER BY count DESC;
