-- Tìm các slug có thể tạo duplicate canonical URL

-- 1. News categories có slug trùng nhau
SELECT 'news_category' as entity, slug, COUNT(*) as count
FROM news_categories
GROUP BY slug
HAVING COUNT(*) > 1;

-- 2. Property types có slug trùng nhau
SELECT 'property_type' as entity, slug, COUNT(*) as count
FROM property_types
GROUP BY slug
HAVING COUNT(*) > 1;

-- 3. News có slug trùng nhau
SELECT 'news' as entity, slug, COUNT(*) as count
FROM news
WHERE is_published = true
GROUP BY slug
HAVING COUNT(*) > 1;

-- 4. Managed pages có slug trùng nhau
SELECT 'managed_page' as entity, slug, COUNT(*) as count
FROM managed_pages
WHERE is_active = true AND is_system = false
GROUP BY slug
HAVING COUNT(*) > 1;

-- 5. Areas có slug trùng nhau
SELECT 'area' as entity, slug, COUNT(*) as count
FROM areas
GROUP BY slug
HAVING COUNT(*) > 1;

-- 6. Neighborhoods có slug trùng nhau
SELECT 'neighborhood' as entity, slug, COUNT(*) as count
FROM neighborhoods
GROUP BY slug
HAVING COUNT(*) > 1;
