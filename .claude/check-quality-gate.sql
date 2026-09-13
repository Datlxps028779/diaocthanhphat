-- Kiểm tra đất nền (33 listings) - đủ quality gate chưa?
SELECT
  COUNT(DISTINCT area_id) as distinct_areas,
  COUNT(DISTINCT district_id) as distinct_districts,
  COUNT(*) as total_listings
FROM properties
WHERE property_type_id = '70c52cd7-d47c-4556-b795-fae9ba3a4d5f'
  AND is_active = true;

-- Kiểm tra nhà phố (18 listings)
SELECT
  COUNT(DISTINCT area_id) as distinct_areas,
  COUNT(DISTINCT district_id) as distinct_districts,
  COUNT(*) as total_listings
FROM properties
WHERE property_type_id = '3167e20b-41a6-408e-9b01-7b214d54b397'
  AND is_active = true;

-- News categories - tại sao entity_id null?
SELECT id, slug, name FROM news_categories ORDER BY slug;
