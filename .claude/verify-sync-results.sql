-- Kiểm tra property_type rows
SELECT entity_type, entity_id, canonical_url, eligible, reason_code
FROM search_visibility_urls
WHERE entity_type = 'property_type'
ORDER BY canonical_url;

-- Kiểm tra news_category entity_id (trước đây 5/6 null)
SELECT entity_type, entity_id, canonical_url, eligible
FROM search_visibility_urls
WHERE entity_type = 'news_category'
ORDER BY canonical_url;

-- Tổng quan
SELECT entity_type,
       COUNT(*) as total,
       SUM(CASE WHEN eligible THEN 1 ELSE 0 END) as eligible_count,
       SUM(CASE WHEN entity_id IS NULL THEN 1 ELSE 0 END) as null_entity_id
FROM search_visibility_urls
GROUP BY entity_type
ORDER BY entity_type;
